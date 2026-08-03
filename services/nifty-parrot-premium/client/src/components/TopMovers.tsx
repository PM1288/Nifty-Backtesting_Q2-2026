import React, { useMemo } from "react";
import type { Stock } from "../types";
import { fmtPct } from "../lib/format";

function Row({ s }: { s: Stock }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-white">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-slate-900">{s.symbol}</div>
        <div className="truncate text-[11px] text-slate-500">{s.sector}</div>
      </div>
      <div
        className={[
          "text-xs tabular-nums",
          s.dayChangePct > 0.05 ? "text-emerald-600" : s.dayChangePct < -0.05 ? "text-rose-600" : "text-amber-700"
        ].join(" ")}
      >
        {fmtPct(s.dayChangePct)}
      </div>
    </div>
  );
}

export function TopMovers({ stocks }: { stocks: Stock[] }) {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...stocks].sort((a, b) => b.dayChangePct - a.dayChangePct);
    return {
      gainers: sorted.slice(0, 6),
      losers: sorted.slice(-6).reverse()
    };
  }, [stocks]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Top gainers</div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
          {gainers.map((s) => (
            <Row key={s.symbol} s={s} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold text-slate-900">Top losers</div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2">
          {losers.map((s) => (
            <Row key={s.symbol} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}
