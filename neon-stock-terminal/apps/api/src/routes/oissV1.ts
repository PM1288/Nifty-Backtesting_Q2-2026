import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function csvCell(value: unknown) {
  const rendered = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${rendered.replaceAll('"', '""')}"`;
}

function xmlCell(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spreadsheetXml(
  sheets: Array<{ name: string; rows: Array<Record<string, unknown>>; columns: string[] }>,
) {
  const worksheets = sheets.map((sheet) => {
    const header = `<Row>${sheet.columns.map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlCell(column)}</Data></Cell>`).join("")}</Row>`;
    const rows = sheet.rows.map((row) => `<Row>${sheet.columns.map((column) => {
      const raw = row[column];
      const numeric = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)));
      const value = typeof raw === "object" && raw !== null ? JSON.stringify(raw) : raw;
      return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${xmlCell(value)}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${xmlCell(sheet.name.slice(0, 31))}"><Table>${header}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style></Styles>${worksheets}</Workbook>`;
}

export function registerOissV1(app: Express, prisma: PrismaClient) {
  app.get("/v1/oiss-v1/runs", async (_req, res) => {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT run_id,run_date,scan_timestamp,scan_sequence,market_stage,trading_mode,data_quality_grade,
         data_quality_score,overall_confidence,status,runtime_metrics,sections->'summary' summary,
         formula_version,config_version,code_commit,completed_at
       FROM oiss.run ORDER BY scan_timestamp DESC LIMIT 250`,
    );
    res.json({ strategyId: "OISS_V1_202608", frameworkVersion: "OISS-1.202608", runs: rows });
  });

  app.get("/v1/oiss-v1/dashboard", async (req, res) => {
    const requested = typeof req.query.runId === "string" ? req.query.runId : "";
    if (requested && !UUID.test(requested)) return res.status(400).json({ error: "runId must be a UUID" });
    const runRows = await prisma.$queryRawUnsafe<Array<Record<string, any>>>(
      `SELECT * FROM oiss.run WHERE status='COMPLETED' AND ($1::uuid IS NULL OR run_id=$1::uuid)
       ORDER BY scan_timestamp DESC LIMIT 1`, requested || null,
    );
    const run = runRows[0] ?? null;
    if (!run) return res.status(404).json({ error: { code: "OISS_RUN_NOT_FOUND", message: "No completed OISS run is available." } });
    const [sectors, radar, changes, outcomes, priorRuns, paper, comparison] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT * FROM oiss.sector_score WHERE run_id=$1::uuid ORDER BY rank`, run.run_id),
      prisma.$queryRawUnsafe(`SELECT c.*,o.outcome_state,o.observed_through,o.returns,o.extrema,p.logo_svg,p.memberships
        FROM oiss.candidate c LEFT JOIN oiss.backtest_outcome o USING(candidate_id)
        LEFT JOIN public.instrument_profiles p ON p.symbol=c.symbol WHERE c.run_id=$1::uuid ORDER BY c.rank`, run.run_id),
      prisma.$queryRawUnsafe(`SELECT * FROM oiss.scan_change WHERE run_id=$1::uuid ORDER BY change_kind,symbol`, run.run_id),
      prisma.$queryRawUnsafe(`SELECT outcome_state,count(*)::int sample_size,
        avg((returns->>'D1')::numeric)::double precision average_d1,
        avg((returns->>'D5')::numeric)::double precision average_d5,
        avg((extrema->>'MFE_PCT')::numeric)::double precision average_mfe,
        avg((extrema->>'MAE_PCT')::numeric)::double precision average_mae
        FROM oiss.backtest_outcome WHERE run_id=$1::uuid GROUP BY outcome_state ORDER BY outcome_state`, run.run_id),
      prisma.$queryRawUnsafe(`SELECT run_id,run_date,scan_timestamp,scan_sequence,data_quality_grade,status,sections->'summary' summary
        FROM oiss.run WHERE status='COMPLETED' ORDER BY scan_timestamp DESC LIMIT 150`),
      prisma.$queryRawUnsafe(`SELECT g.trade_group_id,g.status,g.strategy_id,g.created_at
        FROM paper_trading.trade_groups g WHERE g.strategy_id='OISS_V1_202608' ORDER BY g.created_at DESC LIMIT 100`),
      prisma.$queryRawUnsafe(`SELECT c.symbol,c.canonical_status oiss_status,source.canonical_status oiis_status,
        c.ofactor oiss_ofactor,source.ofactor oiis_ofactor,c.xfactor oiss_xfactor,source.xfactor_snapshot oiis_xfactor
        FROM oiss.candidate c LEFT JOIN oiis_live.daily_candidate source ON source.candidate_id=c.source_oiis_candidate_id
        WHERE c.run_id=$1::uuid ORDER BY c.rank`, run.run_id),
    ]);
    res.json({ strategy: { id: "OISS_V1_202608", displayName: "OISS v1.202608", frameworkVersion: "OISS-1.202608" }, run, sectors, radar, changes, outcomes, priorRuns, paper, comparison });
  });

  app.get("/v1/oiss-v1/export", async (req, res) => {
    const runId = typeof req.query.runId === "string" ? req.query.runId : "";
    const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "json";
    if (!UUID.test(runId)) return res.status(400).json({ error: "runId must be a UUID" });
    const [run, sectors, candidates, changes, outcomes] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM oiss.run WHERE run_id=$1::uuid`, runId),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM oiss.sector_score WHERE run_id=$1::uuid ORDER BY rank`, runId),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM oiss.candidate WHERE run_id=$1::uuid ORDER BY rank`, runId),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM oiss.scan_change WHERE run_id=$1::uuid ORDER BY symbol`, runId),
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM oiss.backtest_outcome WHERE run_id=$1::uuid ORDER BY symbol`, runId),
    ]);
    if (!run[0]) return res.status(404).json({ error: "Run not found" });
    const candidateColumns = ["symbol","company_name","sector","direction","ofactor_long","ofactor_short","ofactor","xfactor","tqs","extension_atr","extension_state","data_quality_grade","canonical_status","why","missing_confirmation","upgrade_condition","invalidation","entry_plan","option_selection","position_sizing","horizon_scores","rejection"];
    if (format === "csv") {
      const columns = candidateColumns;
      const csv = [columns.join(","), ...candidates.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=OISS_${runId}.csv`);
      return res.send(`\ufeff${csv}`);
    }
    if (format === "xls" || format === "xlsx") {
      const runColumns = Object.keys(run[0]);
      const sectorColumns = sectors.length ? Object.keys(sectors[0]) : [];
      const changeColumns = changes.length ? Object.keys(changes[0]) : [];
      const outcomeColumns = outcomes.length ? Object.keys(outcomes[0]) : [];
      res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=OISS_${runId}.xls`);
      return res.send(spreadsheetXml([
        { name: "Run Identity", rows: run, columns: runColumns },
        { name: "Stock Radar", rows: candidates, columns: candidateColumns },
        { name: "Sector Rotation", rows: sectors, columns: sectorColumns },
        { name: "Scan Changes", rows: changes, columns: changeColumns },
        { name: "Forward Outcomes", rows: outcomes, columns: outcomeColumns },
      ]));
    }
    if (format !== "json") return res.status(400).json({ error: "format must be csv, xls, xlsx, or json" });
    res.setHeader("Content-Disposition", `attachment; filename=OISS_${runId}.json`);
    return res.json({ schemaVersion: "1.0", exportedAt: new Date().toISOString(), run: run[0], sectors, candidates, changes, outcomes });
  });
}
