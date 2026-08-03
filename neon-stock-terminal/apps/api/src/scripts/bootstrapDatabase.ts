import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureDashboardSnapshotInfrastructure } from "../lib/dashboardSnapshots";

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureDashboardSnapshotInfrastructure(prisma, "apply");
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "api_database_bootstrap_complete"
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
