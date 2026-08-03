import React, { useEffect, useMemo, useState } from "react";
import { Leva, useControls } from "leva";
import { fetchDashboard } from "./api";
import type { DashboardPayload } from "./types";
import { fmtNum, fmtPct, fmtTimeHHMM } from "./lib/format";
import { PremiumTreeScene3D, type SceneTuning } from "./components/PremiumTreeScene3D";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function App() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeT, setTimeT] = useState(0.5);
  const [timeLocked, setTimeLocked] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const tuningControls = useControls(
    "Clay Diorama Tuning",
    {
      leafMinSize: { value: 0.82, min: 0.55, max: 1.25, step: 0.01 },
      leafMaxSize: { value: 1.42, min: 1.0, max: 2.0, step: 0.01 },
      neutralBand: { value: 0.2, min: 0.05, max: 0.6, step: 0.01 },
      redHue: { value: 7, min: 0, max: 25, step: 1 },
      greenHue: { value: 134, min: 110, max: 150, step: 1 },
      saturation: { value: 0.96, min: 0.45, max: 1.25, step: 0.01 },
      windMultiplier: { value: 1, min: 0, max: 2.3, step: 0.01 },
      aoStrength: { value: 0.6, min: 0, max: 1.2, step: 0.01 },
      shadowSoftness: { value: 0.75, min: 0.15, max: 1.25, step: 0.01 },
      canopyDensity: { value: 1.0, min: 0.6, max: 1.5, step: 0.01 }
    },
    { collapsed: false }
  );

  const tuning: SceneTuning = tuningControls;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setError(null);
        const next = await fetchDashboard(120, 1337);
        if (!alive) return;
        setData(next);
        if (!timeLocked) setTimeT(next.session.t);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message ?? "Failed to load dashboard payload");
      }
    };

    load();
    const id = window.setInterval(load, 6000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [timeLocked]);

  const current = useMemo(() => {
    if (!data) return null;
    const idx = Math.floor(clamp(timeT, 0, 1) * (data.nifty50.series.length - 1));
    return data.nifty50.series[idx] ?? data.nifty50.series[data.nifty50.series.length - 1];
  }, [data, timeT]);

  const topGainers = useMemo(
    () => (data?.n100.stocks ?? []).slice().sort((a, b) => b.dayChangePct - a.dayChangePct).slice(0, 5),
    [data]
  );
  const topLosers = useMemo(
    () => (data?.n100.stocks ?? []).slice().sort((a, b) => a.dayChangePct - b.dayChangePct).slice(0, 5),
    [data]
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f6f7f4_100%)] text-slate-900">
      {import.meta.env.DEV ? <Leva collapsed oneLineLabels hideCopyButton /> : null}

      <div className="mx-auto w-full max-w-[1420px] px-4 py-6 md:px-8 md:py-8">
        <header className="mb-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[30px] font-semibold tracking-tight">NIFTY Clay Tree</h1>
              <p className="text-sm text-slate-600">100 leaves = NIFTY100 · Sun = NIFTY50 · Water = RSI · Wind = VIX</p>
            </div>
            {data ? (
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
                as-of {fmtTimeHHMM(data.session.asOfIso)} · Leaves {data.n100.stocks.length}
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric label="NIFTY 50" value={current ? fmtNum(current.value) : "—"} highlight={current ? fmtPct(current.changePct) : "—"} positive={(current?.changePct ?? 0) >= 0} />
          <Metric label="VIX" value={data ? data.vix.value.toFixed(1) : "—"} />
          <Metric label="RSI" value={data ? data.niftyRsi.value.toFixed(1) : "—"} />
          <Metric label="Session" value={data ? `${data.session.open} → ${data.session.close}` : "—"} />
          <Metric label="Top Gainer" value={topGainers[0] ? `${topGainers[0].symbol} ${fmtPct(topGainers[0].dayChangePct)}` : "—"} positive />
          <Metric label="Top Loser" value={topLosers[0] ? `${topLosers[0].symbol} ${fmtPct(topLosers[0].dayChangePct)}` : "—"} positive={false} />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session Time</div>
            <button
              onClick={() => {
                if (!data) return;
                setTimeLocked(false);
                setTimeT(data.session.t);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Live
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={timeT}
            onChange={(e) => {
              setTimeLocked(true);
              setTimeT(Number(e.target.value));
            }}
            className="w-full"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data?.n100.sectors.map((s) => (
              <button
                key={s.sector}
                onClick={() => setSelectedSector((prev) => (prev === s.sector ? null : s.sector))}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] transition",
                  selectedSector === s.sector
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                ].join(" ")}
              >
                {s.sector} · {fmtPct(s.avgChangePct)}
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <PremiumTreeScene3D data={data} tuning={tuning} selectedSector={selectedSector} timeT={timeT} />
        ) : (
          <div className="h-[760px] rounded-[30px] border border-slate-200 bg-white shadow-sm" />
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
  positive
}: {
  label: string;
  value: string;
  highlight?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
      {highlight ? (
        <div className={["mt-1 text-xs font-semibold", positive ? "text-emerald-600" : "text-rose-600"].join(" ")}>
          {highlight}
        </div>
      ) : null}
    </div>
  );
}
