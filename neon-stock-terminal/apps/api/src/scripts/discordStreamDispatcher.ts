import { PrismaClient } from "@prisma/client";

import {
  runDiscordMarketStreamSchedulerTick,
  startDiscordMarketStreamScheduler,
  stopDiscordMarketStreamScheduler
} from "../lib/discordMarketStream";

async function main() {
  const prisma = new PrismaClient();

  const shutdown = async () => {
    stopDiscordMarketStreamScheduler();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  startDiscordMarketStreamScheduler(prisma);
  await runDiscordMarketStreamSchedulerTick(prisma);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "discord_market_stream_dispatcher_started"
    })
  );
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "discord_market_stream_dispatcher_crashed",
      error: error instanceof Error ? error.message : String(error)
    })
  );
  process.exit(1);
});
