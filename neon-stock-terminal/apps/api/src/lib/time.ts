import { DateTime } from "luxon";

export const MARKET_TZ = process.env.TZ || "Asia/Kolkata";

export function marketNow(): DateTime {
  return DateTime.now().setZone(MARKET_TZ);
}

export function effectiveMarketDay(d: DateTime = marketNow()): DateTime {
  let sessionDay = d.startOf("day");
  while (sessionDay.weekday > 5) {
    sessionDay = sessionDay.minus({ days: 1 });
  }
  return sessionDay;
}

export function marketDayIso(d: DateTime = marketNow()): string {
  return effectiveMarketDay(d).toISODate() ?? marketNow().toISODate() ?? "";
}

export function marketDayKeyUtc(d: DateTime = marketNow()): Date {
  return effectiveMarketDay(d).toUTC().toJSDate();
}

export function marketDayStartUtc(d: DateTime = marketNow()): Date {
  return effectiveMarketDay(d).toUTC().toJSDate();
}

export function marketDayEndUtc(d: DateTime = marketNow()): Date {
  return effectiveMarketDay(d).plus({ days: 1 }).toUTC().toJSDate();
}
