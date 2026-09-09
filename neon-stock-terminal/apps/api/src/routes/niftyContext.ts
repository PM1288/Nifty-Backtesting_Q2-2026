import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

export function registerNiftyContext(app: Express, prisma: PrismaClient) {
  app.get("/v1/nifty-context", async (req, res) => {
    if (process.env.NIFTY_CONTEXT_ENABLED === "false")
      return res.status(404).json({ error: { code: "MODULE_DISABLED" } });
    if (req.query.run != null && !/^[a-f0-9]{64}$/.test(String(req.query.run)))
      return res.status(400).json({ error: { code: "INVALID_RUN" } });
    try {
      const runs = await prisma.$queryRawUnsafe<
        Array<{ id: string; report: Record<string, unknown> }>
      >(
        "SELECT id,report FROM nifty_context.runs WHERE ($1::text IS NULL OR id=$1) ORDER BY created_at DESC LIMIT 1",
        req.query.run ?? null,
      );
      if (!runs.length)
        return res.json({
          state: "NOT_RUN",
          report: null,
          predictions: [],
          snapshots: [],
          executionEnabled: false,
        });
      const predictions = await prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(
        "SELECT p.id,p.result,e.evidence AS explanation FROM nifty_context.predictions p JOIN nifty_context.explanations e ON e.prediction_id=p.id WHERE p.run_id=$1 ORDER BY p.cutoff",
        runs[0].id,
      );
      const snapshots = await prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(
        "SELECT cutoff,generated_at,mode FROM nifty_context.snapshots WHERE mode='PROSPECTIVE_CAPTURE' ORDER BY cutoff DESC LIMIT 100",
      );
      return res.json({
        state: runs[0].report.state,
        report: runs[0].report,
        predictions,
        snapshots,
        executionEnabled: false,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "nifty_context_read_failed",
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
      return res
        .status(503)
        .json({ error: { code: "RESEARCH_DATA_UNAVAILABLE" } });
    }
  });
  app.get("/v1/nifty-context/export/:run", async (req, res) => {
    if (process.env.NIFTY_CONTEXT_ENABLED === "false")
      return res.status(404).end();
    if (!/^[a-f0-9]{64}$/.test(req.params.run)) return res.status(400).end();
    try {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT p.*,s.evidence AS input_snapshot,e.evidence AS explanation
        FROM nifty_context.predictions p JOIN nifty_context.snapshots s ON s.id=p.snapshot_id
        JOIN nifty_context.explanations e ON e.prediction_id=p.id WHERE p.run_id=$1 ORDER BY p.cutoff`,
        req.params.run,
      );
      const models = await prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >("SELECT * FROM nifty_context.models WHERE run_id=$1", req.params.run);
      const runs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        "SELECT * FROM nifty_context.runs WHERE id=$1",
        req.params.run,
      );
      if (!runs.length)
        return res.status(404).json({ error: { code: "RUN_NOT_FOUND" } });
      const snapshots = await prisma.$queryRawUnsafe<
        Array<Record<string, unknown>>
      >(
        "SELECT s.* FROM nifty_context.run_snapshots r JOIN nifty_context.snapshots s ON s.id=r.snapshot_id WHERE r.run_id=$1 ORDER BY s.cutoff",
        req.params.run,
      );
      return res
        .attachment(`nifty-context-${req.params.run}.json`)
        .json({ runs, models, snapshots, predictions: rows });
    } catch {
      return res.status(503).json({ error: { code: "EXPORT_UNAVAILABLE" } });
    }
  });
}
