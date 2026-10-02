export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(`API ${status}: ${message}`); this.name = "HttpError"; }
}

/** Read requests have a deadline and preserve caller cancellation through body parsing. */
export async function readJson<T>(url: string, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Data request timed out. Please retry.", "TimeoutError")), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include", signal: controller.signal });
    if (!response.ok) {
      // Never show raw HTML, database diagnostics or upstream stack traces in UI.
      let message = response.status >= 500 ? "Data service is temporarily unavailable. Please retry." : "Request failed.";
      if (response.status === 401) message = "Please sign in to continue.";
      else if (response.status === 403) message = "This request is not permitted.";
      else if (response.status === 429) message = "Too many requests. Please wait and retry.";
      throw new HttpError(response.status, message);
    }
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Data service returned an unexpected response. Please retry.");
    return await response.json() as T;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
