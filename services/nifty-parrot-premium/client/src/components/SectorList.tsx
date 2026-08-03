import React from "react";
import type { SectorStat } from "../types";
import { fmtPct } from "../lib/format";
import { branchInnerHslFromSector, hslToCss } from "../lib/color";

export function SectorList({
  sectors,
  selectedSector,
  onSelect
}: {
  sectors: SectorStat[];
  selectedSector: string | null;
  onSelect: (sector: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Sectors</div>
        <button
          onClick={() => onSelect(null)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 shadow-softer hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      <div className="max-h-[480px] overflow-auto rounded-xl border border-slate-100 bg-slate-50/40 p-2">
        {sectors.map((s) => {
          const isSel = selectedSector === s.sector;
          const hsl = branchInnerHslFromSector(s.avgChangePct);
          const chip = hslToCss(hsl, 0.95);
          return (
            <button
              key={s.sector}
              onClick={() => onSelect(isSel ? null : s.sector)}
              className={[
                "w-full rounded-xl px-3 py-2 text-left transition",
                isSel ? "bg-white shadow-softer ring-1 ring-slate-200" : "hover:bg-white"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-slate-900">{s.sector}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{s.symbolCount} stocks</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: chip }} />
                  <div
                    className={[
                      "text-[13px] tabular-nums",
                      s.avgChangePct > 0.05
                        ? "text-emerald-600"
                        : s.avgChangePct < -0.05
                          ? "text-rose-600"
                          : "text-amber-600"
                    ].join(" ")}
                  >
                    {fmtPct(s.avgChangePct)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-slate-500">
        Click a sector to spotlight its branch & leaves.
      </div>
    </div>
  );
}
