import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { readPredictor } from "../lib/predictorService";
export function registerPredictor(app: Express, prisma: PrismaClient) {
  app.get("/v1/predictor", async (req, res) => {
    const day = req.query.day;
    if (
      day != null &&
      (typeof day !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day)
    )
      return res.status(400).json({ error: "Invalid session date" });
    try {
      return res.json(await readPredictor(prisma, day as string | undefined));
    } catch {
      return res
        .status(503)
        .json({
          error:
            "Predictor evidence unavailable. No forecast or success is implied.",
        });
    }
  });
  app.get("/v1/predictor/evidence/:id", async (req, res) => {
    if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).end();
    try {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT f.id::text,f.session_date::text,f.symbol,f.model,f.version,f.published_at,f.target_at,f.source_at,f.payload,o.payload outcome
        FROM market_predictor.forecast f LEFT JOIN market_predictor.outcome o ON o.forecast_id=f.id WHERE f.id=$1::bigint`,
        req.params.id,
      );
      return rows.length
        ? res.json(rows[0])
        : res.status(404).json({ error: "Forecast not found" });
    } catch {
      return res.status(503).json({ error: "Evidence unavailable" });
    }
  });
}
