import type { Express, RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

/** Private upstreams are selected by a fixed route allowlist, never a client URL. */
export function dataProxyTarget(path: string, exportsBase: string, intradayBase: string): string | null {
  if (path.startsWith("/api/v1/intraday/")) return intradayBase;
  if (["/api/v1/dashboard/", "/api/v1/ops/", "/api/v1/exports/"].some(prefix => path.startsWith(prefix)) ||
      path === "/api/v1/watchlists" || path.startsWith("/api/v1/watchlists/")) return exportsBase;
  return null;
}

export function registerDataProxy(app: Express, authenticate: RequestHandler, exportsBase: string, intradayBase: string) {
  app.use((req, res, next) => {
    const base = dataProxyTarget(req.path, exportsBase, intradayBase);
    if (!base || !["GET", "HEAD"].includes(req.method)) return next();
    res.setHeader("Cache-Control", "no-store");
    // Run authentication before any upstream request, including HEAD and downloads.
    authenticate(req, res, error => {
      if (error) return next(error);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const abort = () => controller.abort();
      res.once("close", abort);
      void (async () => {
        try {
          const upstream = await fetch(`${base.replace(/\/+$/, "")}${req.url}`, {
            method: req.method,
            headers: { Accept: req.get("accept") ?? "application/json" },
            redirect: "error",
            signal: controller.signal
          });
          res.status(upstream.status);
          for (const header of ["content-type", "content-disposition", "etag", "last-modified"]) {
            const value = upstream.headers.get(header);
            if (value) res.setHeader(header, value);
          }
          if (req.method === "HEAD" || !upstream.body) { res.end(); return; }
          // Stream with backpressure; exports no longer allocate a full response buffer.
          await pipeline(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>), res);
        } catch {
          if (res.destroyed) return;
          if (res.headersSent) { res.destroy(); return; }
          next(Object.assign(new Error("Upstream data service is unavailable."), {
            status: controller.signal.aborted ? 504 : 502, code: "UPSTREAM_UNAVAILABLE"
          }));
        } finally {
          clearTimeout(timer);
          res.off("close", abort);
        }
      })();
    });
  });
}
