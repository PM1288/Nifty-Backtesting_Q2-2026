import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { materializeAllSnapshots } from "../lib/snapshotRegistry";

async function main() {
  const prisma = new PrismaClient();
  try {
    await materializeAllSnapshots(prisma);
    // eslint-disable-next-line no-console
    console.log("Dashboard snapshots refreshed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
