import { PrismaClient, AssetType } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();
const MARKET_TZ = "Asia/Kolkata";

function dayKeyUtc(): Date {
  return DateTime.now().setZone(MARKET_TZ).startOf("day").toUTC().toJSDate();
}

function marketTsUtc(hour: number, minute: number): DateTime {
  return DateTime.now()
    .setZone(MARKET_TZ)
    .startOf("day")
    .set({ hour, minute, second: 0, millisecond: 0 });
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function d2(n: number): string {
  // Keep decimals explicit for Prisma Decimal fields.
  return (Math.round(n * 100) / 100).toFixed(2);
}

async function main() {
  // Reset (dev only)
  await prisma.intradayBar.deleteMany();
  await prisma.dailySnapshot.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.sector.deleteMany();

  const sectors = [
    "IT",
    "BANKS",
    "FMCG",
    "ENERGY",
    "AUTO",
    "PHARMA",
    "METALS",
    "REALTY",
    "MEDIA",
    "INFRA"
  ];

  await prisma.sector.createMany({
    data: sectors.map((name, idx) => ({ name, sortOrder: idx })),
    skipDuplicates: true
  });

  const sectorList = await prisma.sector.findMany({ orderBy: { sortOrder: "asc" } });

  // Create Nifty index
  await prisma.stock.create({
    data: {
      symbol: "NIFTY50",
      name: "Nifty 50",
      assetType: AssetType.INDEX,
      isNifty50: true,
      isNifty100: false
    }
  });

  // Create 100 synthetic stocks (replace with real universe later)
  const stocks = [];
  for (let i = 1; i <= 100; i++) {
    const symbol = `STK${String(i).padStart(3, "0")}`;
    const sector = sectorList[(i - 1) % sectorList.length];
    stocks.push({
      symbol,
      name: `Stock ${i}`,
      assetType: AssetType.EQUITY,
      sectorId: sector.id,
      isNifty50: i <= 50,
      isNifty100: true
    });
  }

  await prisma.stock.createMany({ data: stocks, skipDuplicates: true });

  const allStocks = await prisma.stock.findMany();

  // Seed today's daily snapshots + intraday bars
  const date = dayKeyUtc();

  // Market session times (IST)
  const start = marketTsUtc(9, 15);
  const end = marketTsUtc(15, 30);
  const intervalMinutes = 5;
  const barsCount = Math.floor(end.diff(start, "minutes").minutes / intervalMinutes);

  for (const stock of allStocks) {
    const base = stock.assetType === AssetType.INDEX ? rand(21000, 24000) : rand(50, 3500);

    const prevClose = base;
    const open = prevClose + rand(-0.8, 0.8) * (base * 0.01);
    const close = open + rand(-1.2, 1.2) * (base * 0.012);

    const high = Math.max(open, close) + Math.abs(rand(0, 1.0) * (base * 0.006));
    const low = Math.min(open, close) - Math.abs(rand(0, 1.0) * (base * 0.006));

    await prisma.dailySnapshot.create({
      data: {
        stockId: stock.id,
        date,
        prevClose: d2(prevClose),
        open: d2(open),
        high: d2(high),
        low: d2(low),
        close: d2(close),
        volume: BigInt(Math.floor(rand(1_000_000, 30_000_000)))
      }
    });

    // Intraday bars (random walk towards close)
    let last = open;
    const points: { ts: Date; o: string; h: string; l: string; c: string; v: bigint }[] = [];

    for (let i = 0; i < barsCount; i++) {
      const t = start.plus({ minutes: i * intervalMinutes }).toUTC().toJSDate();

      const progress = i / Math.max(1, barsCount - 1);
      const target = open + (close - open) * progress;

      const drift = (target - last) * 0.35;
      const noise = rand(-1, 1) * (base * 0.0015);

      const o = last;
      const c = last + drift + noise;

      const hi = Math.max(o, c) + Math.abs(rand(0, 1) * (base * 0.0009));
      const lo = Math.min(o, c) - Math.abs(rand(0, 1) * (base * 0.0009));

      points.push({
        ts: t,
        o: d2(o),
        h: d2(hi),
        l: d2(lo),
        c: d2(c),
        v: BigInt(Math.floor(rand(10_000, 150_000)))
      });

      last = c;
    }

    await prisma.intradayBar.createMany({
      data: points.map((p) => ({
        stockId: stock.id,
        ts: p.ts,
        open: p.o,
        high: p.h,
        low: p.l,
        close: p.c,
        volume: p.v
      }))
    });
  }

  console.log("Seed completed:", { sectors: sectorList.length, stocks: allStocks.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
