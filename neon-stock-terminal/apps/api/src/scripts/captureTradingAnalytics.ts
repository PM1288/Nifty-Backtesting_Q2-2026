import { PrismaClient } from "@prisma/client";
import { loadTradingAnalytics } from "../routes/tradingAnalytics";
/** Explicit bootstrap/research capture only. Does not register a second scheduler. */
async function main() {
  const prisma = new PrismaClient();
  const asOf = process.argv[2] ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) > Date.now())
    throw new Error("Valid nonfuture ISO asOf required");
  try {
    const evidence = await loadTradingAnalytics(
      prisma,
      new Date(asOf).toISOString(),
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO audit.trading_analytics_evidence (evidence_id,strategy_version,instrument_identity,evaluated_at,known_at,state,snapshot) VALUES ($1,$2,'NSE:NIFTY',$3::timestamptz,now(),$4,$5::jsonb) ON CONFLICT DO NOTHING`,
      evidence.evidenceId,
      evidence.version,
      asOf,
      evidence.state,
      JSON.stringify(evidence),
    );
    console.log(
      JSON.stringify({
        evidenceId: evidence.evidenceId,
        asOf,
        activityRows: evidence.activity.length,
        participants: evidence.participants.length,
        issues: evidence.issues.length,
        sourceFailures: evidence.errors,
        optionLegs: evidence.chain.legs.length,
        state: evidence.state,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "TRADING_ANALYTICS_CAPTURE_FAILED: inspect data availability and migration; credentials and payloads withheld.",
  );
  process.exitCode = 1;
});
