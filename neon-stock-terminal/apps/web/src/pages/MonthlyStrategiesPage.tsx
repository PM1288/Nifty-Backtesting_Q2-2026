import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  fetchAbsoluteFirstSessionDashboard,
  fetchAbsoluteMonthlyDashboard,
  fetchRollingMonthlyDashboard,
  fetchRollingWindowDashboard,
} from "../lib/api";
import {
  matchesStockProfile,
  useProfileIndex,
  type StockProfileFilters,
} from "../lib/stockProfiles";
import {
  StockIdentity,
  StockUniverseFilterBar,
} from "../components/stocks/StockProfileControls";
import styles from "./MonthlyStrategiesPage.module.css";

type EvidenceRow = {
  id: string;
  entryMethod:
    | "EXPIRY"
    | "MONTHLY_CLOSURE"
    | "FIRST_SESSION"
    | "ROLLING_5_30_60";
  symbol: string;
  period: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number | null;
  endPrice: number | null;
  endReturn: number | null;
  maxProfit: number | null;
  maxDrawdown: number | null;
  pnl10000: number | null;
  maxProfit10000: number | null;
  maxDrawdown10000: number | null;
  status: string;
  selectionStatus:
    | "SELECTED"
    | "REJECTED"
    | "INCOMPLETE"
    | "QUALIFIED_CONTINUATION";
  gapThreshold: number | null;
  gapPct: number | null;
  ema9: number | null;
  closeAboveEma9: boolean | null;
  candleAboveEma9Pct: number | null;
  hit1: boolean;
  hit3: boolean;
  hit5: boolean;
  raw: Record<string, any>;
};

const number = (value: unknown): number | null => {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed)
    ? null
    : parsed;
};
const text = (value: unknown) =>
  value == null ? "" : String(value).slice(0, 10);
const money = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(value);
const pct = (value: number | null) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const price = (value: number | null) =>
  value == null
    ? "—"
    : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const truth = (value: unknown): boolean | null =>
  value == null ? null : value === true || value === "true";
const rejectionReasons = (row: EvidenceRow): string[] => {
  const values =
    Array.isArray(row.raw.rejection_reasons) && row.raw.rejection_reasons.length
      ? row.raw.rejection_reasons
      : Array.isArray(row.raw.failed_condition_codes)
        ? row.raw.failed_condition_codes
        : [];
  return values.map(String);
};
const reasonLabel = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());

function normalized(
  expiry: Array<Record<string, any>>,
  closure: Array<Record<string, any>>,
  firstSession: Array<Record<string, any>>,
  closureEvaluations: Array<Record<string, any>> = [],
): EvidenceRow[] {
  const fromExpiry = expiry.map((row): EvidenceRow => {
    const entry = number(row.entry_price);
    const end = number(row.current_price);
    const endReturn = number(row.expiry_return_pct ?? row.current_return_pct);
    const maxProfit = number(row.max_profit_pct ?? row.mfe_to_date_pct);
    const maxDrawdown = number(row.max_drawdown_pct);
    const scanner = row.scanner_evidence ?? {};
    const quantity = entry ? Math.floor(10000 / entry) : 0;
    return {
      id: String(row.candidate_id),
      entryMethod: "EXPIRY",
      symbol: String(row.symbol),
      period: text(row.expiry_month),
      signalDate: text(row.expiry_signal_date ?? row.signal_date),
      entryDate: text(row.expiry_entry_date ?? row.entry_date),
      entryPrice: entry,
      endPrice: end,
      endReturn,
      maxProfit,
      maxDrawdown,
      pnl10000: entry != null && end != null ? quantity * (end - entry) : null,
      maxProfit10000:
        entry != null && maxProfit != null
          ? (quantity * entry * maxProfit) / 100
          : null,
      maxDrawdown10000:
        entry != null && maxDrawdown != null
          ? (quantity * entry * maxDrawdown) / 100
          : null,
      status: String(row.expiry_evaluation_status ?? "DEVELOPING"),
      selectionStatus: "SELECTED",
      gapThreshold: null,
      gapPct: null,
      ema9: number(scanner.m1_monthly_ema9),
      closeAboveEma9: truth(scanner.m1_close_above_monthly_ema9),
      candleAboveEma9Pct: number(scanner.m1_candle_above_monthly_ema9_pct),
      hit1: (maxProfit ?? -Infinity) >= 1,
      hit3: (maxProfit ?? -Infinity) >= 3,
      hit5: (maxProfit ?? -Infinity) >= 5,
      raw: row,
    };
  });
  const fromClosure = closure.map((row): EvidenceRow => {
    const entry = number(row.entry_price);
    const end = number(row.path_end_price);
    const quantity = entry ? Math.floor(10000 / entry) : 0;
    const maxProfit = number(row.max_profit_pct);
    const maxDrawdown = number(row.max_drawdown_pct);
    return {
      id: String(row.candidate_id),
      entryMethod: "MONTHLY_CLOSURE",
      symbol: String(row.symbol),
      period: text(row.evaluation_month),
      signalDate: text(row.signal_date),
      entryDate: text(row.entry_date),
      entryPrice: entry,
      endPrice: end,
      endReturn: number(row.end_return_pct),
      maxProfit,
      maxDrawdown,
      pnl10000: entry != null && end != null ? quantity * (end - entry) : null,
      maxProfit10000:
        entry != null && maxProfit != null
          ? (quantity * entry * maxProfit) / 100
          : null,
      maxDrawdown10000:
        entry != null && maxDrawdown != null
          ? (quantity * entry * maxDrawdown) / 100
          : null,
      status: String(row.evaluation_status),
      selectionStatus: "SELECTED",
      gapThreshold: null,
      gapPct: null,
      ema9: number(row.monthly_ema9),
      closeAboveEma9: truth(row.monthly_close_above_ema9),
      candleAboveEma9Pct: number(row.monthly_candle_above_ema9_pct),
      hit1: (maxProfit ?? -Infinity) >= 1,
      hit3: (maxProfit ?? -Infinity) >= 3,
      hit5: (maxProfit ?? -Infinity) >= 5,
      raw: row,
    };
  });
  const fromFirst = firstSession.map((row): EvidenceRow => {
    const maxProfit = number(row.max_profit_pct);
    const maxDrawdown = number(row.max_drawdown_pct);
    return {
      id: String(row.candidate_id),
      entryMethod: "FIRST_SESSION",
      symbol: String(row.symbol),
      period: text(row.evaluation_month),
      signalDate: text(row.first_session_date),
      entryDate: text(row.entry_date),
      entryPrice: number(row.entry_price),
      endPrice: number(row.path_end_price),
      endReturn: number(row.end_return_pct),
      maxProfit,
      maxDrawdown,
      pnl10000: number(row.end_pnl_10000),
      maxProfit10000: number(row.max_profit_10000),
      maxDrawdown10000: number(row.max_drawdown_10000),
      status: String(
        row.entry_status === "ENTERED"
          ? row.evaluation_status
          : row.entry_status,
      ),
      selectionStatus: row.entry_status === "ENTERED" ? "SELECTED" : "REJECTED",
      gapThreshold: number(row.gap_threshold_pct),
      gapPct: number(row.opening_gap_pct),
      ema9: number(row.monthly_ema9),
      closeAboveEma9: truth(row.monthly_close_above_ema9),
      candleAboveEma9Pct: number(row.monthly_candle_above_ema9_pct),
      hit1: (maxProfit ?? -Infinity) >= 1,
      hit3: (maxProfit ?? -Infinity) >= 3,
      hit5: (maxProfit ?? -Infinity) >= 5,
      raw: row,
    };
  });
  const rejectedClosure = closureEvaluations
    .filter((row) => row.selection_status !== "SELECTED")
    .map(
      (row): EvidenceRow => ({
        id: String(row.evaluation_id),
        entryMethod: "MONTHLY_CLOSURE",
        symbol: String(row.symbol),
        period: text(row.evaluation_month),
        signalDate: text(row.signal_date),
        entryDate: "",
        entryPrice: null,
        endPrice: null,
        endReturn: null,
        maxProfit: null,
        maxDrawdown: null,
        pnl10000: null,
        maxProfit10000: null,
        maxDrawdown10000: null,
        status: String(row.selection_status),
        selectionStatus: String(
          row.selection_status,
        ) as EvidenceRow["selectionStatus"],
        gapThreshold: null,
        gapPct: null,
        ema9: null,
        closeAboveEma9: null,
        candleAboveEma9Pct: null,
        hit1: false,
        hit3: false,
        hit5: false,
        raw: {
          ...row,
          conditions: row.conditions ?? [],
          rejection_reasons: row.rejection_reasons ?? [],
        },
      }),
    );
  return [...fromExpiry, ...fromClosure, ...fromFirst, ...rejectedClosure];
}

function csvDownload(rows: EvidenceRow[], filename: string) {
  const columns: Array<[string, (row: EvidenceRow) => unknown]> = [
    ["entry_method", (r) => r.entryMethod],
    ["symbol", (r) => r.symbol],
    ["period", (r) => r.period],
    ["signal_date", (r) => r.signalDate],
    ["entry_date", (r) => r.entryDate],
    ["entry_price", (r) => r.entryPrice],
    ["status", (r) => r.status],
    ["end_return_pct", (r) => r.endReturn],
    ["max_profit_pct", (r) => r.maxProfit],
    ["max_drawdown_pct", (r) => r.maxDrawdown],
    ["pnl_10000", (r) => r.pnl10000],
    ["monthly_ema9", (r) => r.ema9],
    ["close_above_ema9", (r) => r.closeAboveEma9],
    ["candle_above_ema9_pct", (r) => r.candleAboveEma9Pct],
  ];
  const quote = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const body = [
    columns.map(([label]) => label).join(","),
    ...rows.map((row) =>
      columns.map(([, getter]) => quote(getter(row))).join(","),
    ),
  ].join("\n");
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StrategyTable({
  rows,
  title,
  profiles,
  onSelect,
}: {
  rows: EvidenceRow[];
  title: string;
  profiles: ReturnType<typeof useProfileIndex>["bySymbol"];
  onSelect: (row: EvidenceRow) => void;
}) {
  const [sort, setSort] = useState<keyof EvidenceRow>("entryDate");
  const [ascending, setAscending] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(250);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const left = a[sort];
        const right = b[sort];
        const order =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""));
        return ascending ? order : -order;
      }),
    [rows, sort, ascending],
  );
  useEffect(() => {
    setVisibleLimit(250);
  }, [rows]);
  const visibleRows = sorted.slice(0, visibleLimit);
  const rollingMode =
    rows.length > 0 &&
    rows.every((row) => row.entryMethod === "ROLLING_5_30_60");
  const header = (key: keyof EvidenceRow, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (sort === key) setAscending((value) => !value);
        else {
          setSort(key);
          setAscending(false);
        }
      }}
    >
      {label}
      {sort === key ? (ascending ? " ↑" : " ↓") : ""}
    </button>
  );
  return (
    <section className={styles.ledger}>
      <header>
        <div>
          <span>COMPLETE EVIDENCE</span>
          <h2>{title}</h2>
        </div>
        <small>
          {rows.length} filtered rows · click a row for the full condition and
          calculation record
        </small>
      </header>
      <div className={styles.tableViewport} tabIndex={0} aria-label={`${title} scrollable evidence table`}>
        <table>
          <thead>
            <tr>
              <th>{header("symbol", "Stock")}</th>
              <th>{header("entryMethod", "Entry method")}</th>
              <th>{header("period", "Month")}</th>
              <th>{header("entryDate", "Entry")}</th>
              <th>Entry price</th>
              <th>{header("endReturn", "As-of / end")}</th>
              <th>{header("maxProfit", "Max profit")}</th>
              <th>{header("maxDrawdown", "Max drawdown")}</th>
              <th>1%</th>
              <th>3%</th>
              <th>5%</th>
              <th>{header("pnl10000", "₹10k P&L")}</th>
              <th>{rollingMode ? "60 / 30-session block" : "Monthly EMA9"}</th>
              <th>
                {rollingMode ? "10 / 5-session opens" : "Body above EMA9"}
              </th>
              <th>{header("status", "State")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={`${row.entryMethod}-${row.id}`}
                onClick={() => onSelect(row)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelect(row);
                }}
              >
                <td>
                  <StockIdentity
                    symbol={row.symbol}
                    profile={profiles.get(row.symbol)}
                    compact
                  />
                </td>
                <td>
                  <b className={styles.method}>
                    {row.entryMethod.replaceAll("_", " ")}
                  </b>
                  <small>{row.selectionStatus.replaceAll("_", " ")}</small>
                  {rejectionReasons(row)[0] ? (
                    <small>{reasonLabel(rejectionReasons(row)[0])}</small>
                  ) : null}
                  {row.gapThreshold != null ? (
                    <small>Gap {row.gapThreshold.toFixed(2)}%</small>
                  ) : null}
                </td>
                <td>{row.period.slice(0, 7)}</td>
                <td>
                  {row.entryDate || "—"}
                  <small>
                    {row.signalDate ? `Signal ${row.signalDate}` : ""}
                  </small>
                </td>
                <td>{price(row.entryPrice)}</td>
                <td
                  className={
                    row.endReturn == null
                      ? styles.missing
                      : row.endReturn >= 0
                        ? styles.positive
                        : styles.negative
                  }
                >
                  {pct(row.endReturn)}
                </td>
                <td className={styles.positive}>{pct(row.maxProfit)}</td>
                <td className={styles.negative}>{pct(row.maxDrawdown)}</td>
                {[row.hit1, row.hit3, row.hit5].map((hit, index) => (
                  <td key={index}>
                    <span className={hit ? styles.hit : styles.miss}>
                      {hit ? "✓ HIT" : "×"}
                    </span>
                  </td>
                ))}
                <td>{money(row.pnl10000)}</td>
                {rollingMode ? (
                  <>
                    <td>
                      {price(number(row.raw.older_block_open))}
                      <small>
                        Older close {price(number(row.raw.older_block_close))} ·
                        recent open {price(number(row.raw.recent_block_open))}
                      </small>
                    </td>
                    <td>
                      {price(number(row.raw.prior_week_open))}
                      <small>
                        5-session {price(number(row.raw.current_week_open))}
                      </small>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      {price(row.ema9)}
                      <small>
                        {row.closeAboveEma9 == null
                          ? "Not available"
                          : row.closeAboveEma9
                            ? "Close above"
                            : "Close below"}
                      </small>
                    </td>
                    <td>
                      {pct(row.candleAboveEma9Pct)}
                      <small>
                        {(row.candleAboveEma9Pct ?? 0) >= 70 ? "≥70%" : "<70%"}
                      </small>
                    </td>
                  </>
                )}
                <td>
                  <span className={styles.state}>
                    {row.status.replaceAll("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleRows.length < sorted.length ? (
        <footer>
          <span>
            Showing {visibleRows.length.toLocaleString("en-IN")} of{" "}
            {sorted.length.toLocaleString("en-IN")} filtered rows
          </span>
          <button
            type="button"
            onClick={() =>
              setVisibleLimit((limit) => Math.min(sorted.length, limit + 250))
            }
          >
            Load 250 more
          </button>
        </footer>
      ) : null}
    </section>
  );
}

function Inspector({
  row,
  onClose,
}: {
  row: EvidenceRow;
  onClose: () => void;
}) {
  const conditions = Array.isArray(row.raw.conditions)
    ? row.raw.conditions
    : Object.entries(row.raw.conditions ?? {}).map(([label, pass]) => ({
        label,
        pass,
      }));
  return (
    <aside
      className={styles.inspector}
      aria-label={`${row.symbol} strategy evidence`}
    >
      <header>
        <div>
          <span>{row.entryMethod.replaceAll("_", " ")}</span>
          <h2>
            {row.symbol} · {row.period.slice(0, 7)}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>
      <div className={styles.inspectorGrid}>
        <Kpi
          label="Entry"
          value={price(row.entryPrice)}
          detail={row.entryDate || "Not entered"}
        />
        <Kpi
          label="End / as-of"
          value={pct(row.endReturn)}
          detail={row.status}
        />
        <Kpi
          label="Maximum profit"
          value={pct(row.maxProfit)}
          detail={money(row.maxProfit10000)}
        />
        <Kpi
          label="Maximum drawdown"
          value={pct(row.maxDrawdown)}
          detail={money(row.maxDrawdown10000)}
        />
      </div>
      <section>
        <h3>Entry conditions</h3>
        {conditions.length ? (
          <ul className={styles.conditions}>
            {conditions.map((condition: any, index: number) => (
              <li
                key={String(condition.code ?? condition.label ?? index)}
                data-pass={condition.pass === true}
              >
                <span>
                  {condition.pass === true
                    ? "✓"
                    : condition.informational
                      ? "i"
                      : "×"}
                </span>
                <div>
                  <b>
                    {String(
                      condition.label ?? condition.code ?? "Condition",
                    ).replaceAll("_", " ")}
                  </b>
                  {condition.left != null || condition.right != null ? (
                    <small>
                      {String(condition.left ?? "—")} {condition.operator ?? ""}{" "}
                      {String(condition.right ?? "—")}
                    </small>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No structured condition trace was persisted for this row.</p>
        )}
      </section>
      {row.entryMethod === "ROLLING_5_30_60" ? (
        <section>
          <h3>Rolling-window context</h3>
          <p>
            Older 60-session open {price(number(row.raw.older_block_open))};
            older block close {price(number(row.raw.older_block_close))}; recent
            30-session open {price(number(row.raw.recent_block_open))};
            10-session and 5-session opens{" "}
            {price(number(row.raw.prior_week_open))} /{" "}
            {price(number(row.raw.current_week_open))}.
          </p>
        </section>
      ) : (
        <section>
          <h3>EMA9 context — informational</h3>
          <p>
            Monthly EMA9 is never used as a silent entry gate. Close:{" "}
            {row.closeAboveEma9 == null
              ? "not available"
              : row.closeAboveEma9
                ? "above EMA9"
                : "below EMA9"}
            ; bullish candle body above EMA9: {pct(row.candleAboveEma9Pct)}.
          </p>
        </section>
      )}
      {rejectionReasons(row).length ? (
        <section>
          <h3>Why it was not selected</h3>
          <ul className={styles.reasonList}>
            {rejectionReasons(row).map((reason) => (
              <li key={reason}>{reasonLabel(reason)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3>Research economics</h3>
        <dl>
          <div>
            <dt>₹10k end P&L</dt>
            <dd>{money(row.pnl10000)}</dd>
          </div>
          <div>
            <dt>₹10k maximum opportunity</dt>
            <dd>{money(row.maxProfit10000)}</dd>
          </div>
          <div>
            <dt>₹10k maximum pain</dt>
            <dd>{money(row.maxDrawdown10000)}</dd>
          </div>
        </dl>
      </section>
      <footer>
        <Link
          to={`/analytics/stock/${encodeURIComponent(row.symbol)}?strategy=${row.entryMethod.toLowerCase()}&asOf=${row.signalDate}`}
        >
          Open Stock 360
        </Link>
        <button
          type="button"
          onClick={() =>
            csvDownload([row], `${row.symbol}-${row.entryMethod}.csv`)
          }
        >
          Download row
        </button>
      </footer>
    </aside>
  );
}

export function MonthlyStrategyPage() {
  const location = useLocation();
  const profiles = useProfileIndex();
  const [data, setData] = useState<{
    expiry: any[];
    closure: any[];
    first: any[];
    closureEvaluations: any[];
  }>({ expiry: [], closure: [], first: [], closureEvaluations: [] });
  const [loadingSources, setLoadingSources] = useState(4);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EvidenceRow | null>(null);
  const requestedMethod = new URLSearchParams(location.search).get(
    "entryMethod",
  );
  const [method, setMethod] = useState(
    ["EXPIRY", "MONTHLY_CLOSURE", "FIRST_SESSION"].includes(
      requestedMethod ?? "",
    )
      ? requestedMethod!
      : "ALL",
  );
  const [year, setYear] = useState("ALL");
  const [month, setMonth] = useState("ALL");
  const [ema, setEma] = useState("ALL");
  const [selection, setSelection] = useState("SELECTED");
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);
  const [failureReason, setFailureReason] = useState("ALL");
  const [stockFilters, setStockFilters] = useState<StockProfileFilters>({
    universe: "ALL",
    capBucket: "ALL",
    sector: "ALL",
  });
  useEffect(() => {
    let active = true;
    const load = async () => {
      setError("");
      setLoadingSources(4);
      let firstRows: any[] = [];
      const apply = (patch: Partial<typeof data>) => {
        if (!active) return;
        setData((current) => ({ ...current, ...patch }));
        setLoadingSources((count) => Math.max(0, count - 1));
      };
      const fail = (reason: unknown) => {
        if (!active) return;
        setError((current) =>
          [current, reason instanceof Error ? reason.message : String(reason)]
            .filter(Boolean)
            .join(" · "),
        );
        setLoadingSources((count) => Math.max(0, count - 1));
      };
      // Each endpoint fans out into several evidence queries. Loading them in
      // parallel exhausted the shared Prisma pool and left the complete page
      // waiting for the slowest request. Render each source as it arrives and
      // keep no more than one monthly endpoint active at a time.
      try {
        const closure = await fetchAbsoluteMonthlyDashboard(
          undefined,
          undefined,
          false,
        );
        apply({ closure: closure.candidates, closureEvaluations: [] });
      } catch (reason) {
        fail(reason);
      }
      try {
        const first = await fetchAbsoluteFirstSessionDashboard(
          undefined,
          undefined,
          "0.50",
        );
        firstRows = first.candidates;
        apply({ first: firstRows });
      } catch (reason) {
        fail(reason);
      }
      try {
        const first = await fetchAbsoluteFirstSessionDashboard(
          undefined,
          undefined,
          "1.00",
        );
        firstRows = [...firstRows, ...first.candidates];
        apply({ first: firstRows });
      } catch (reason) {
        fail(reason);
      }
      try {
        const rolling = await fetchRollingMonthlyDashboard();
        apply({ expiry: rolling.expiryHistory.candidates });
      } catch (reason) {
        fail(reason);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (
      selection === "SELECTED" ||
      data.closureEvaluations.length > 0 ||
      evaluationsLoading
    )
      return;
    let active = true;
    setEvaluationsLoading(true);
    fetchAbsoluteMonthlyDashboard(undefined, undefined, true)
      .then((closure) => {
        if (active)
          setData((current) => ({
            ...current,
            closureEvaluations: closure.evaluations ?? [],
          }));
      })
      .catch((reason) => {
        if (active)
          setError((current) =>
            [current, reason instanceof Error ? reason.message : String(reason)]
              .filter(Boolean)
              .join(" · "),
          );
      })
      .finally(() => {
        if (active) setEvaluationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data.closureEvaluations.length, selection]);
  const allRows = useMemo(
    () =>
      normalized(
        data.expiry,
        data.closure,
        data.first,
        data.closureEvaluations,
      ),
    [data],
  );
  const years = useMemo(
    () =>
      Array.from(new Set(allRows.map((row) => row.period.slice(0, 4))).values())
        .filter(Boolean)
        .sort()
        .reverse(),
    [allRows],
  );
  const failureReasons = useMemo(
    () => Array.from(new Set(allRows.flatMap(rejectionReasons))).sort(),
    [allRows],
  );
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (selection === "ALL" || row.selectionStatus === selection) &&
          (failureReason === "ALL" ||
            rejectionReasons(row).includes(failureReason)) &&
          (method === "ALL" || row.entryMethod === method) &&
          (year === "ALL" || row.period.startsWith(year)) &&
          (month === "ALL" || row.period.slice(5, 7) === month) &&
          (ema === "ALL" ||
            (ema === "ABOVE" && row.closeAboveEma9) ||
            (ema === "BELOW" && row.closeAboveEma9 === false) ||
            (ema === "BODY70" && (row.candleAboveEma9Pct ?? -1) >= 70)) &&
          matchesStockProfile(profiles.bySymbol.get(row.symbol), stockFilters),
      ),
    [
      allRows,
      selection,
      failureReason,
      method,
      year,
      month,
      ema,
      profiles.bySymbol,
      stockFilters,
    ],
  );
  const eligible = rows.filter((row) => row.endReturn != null);
  const winners = eligible.filter((row) => (row.endReturn ?? 0) > 0);
  const total = (key: "pnl10000" | "maxProfit10000" | "maxDrawdown10000") =>
    eligible.reduce((sum, row) => sum + (row[key] ?? 0), 0);
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>INDEPENDENT CASH-EQUITY RESEARCH · NOT OIIS</span>
          <h1>Monthly Strategy</h1>
          <p>
            Compare expiry-anchored, calendar-month closure and first-session
            entries in one evidence ledger. The entry date changes; outcomes,
            target tests and capital bases remain directly comparable.
          </p>
        </div>
        <nav>
          <Link className={styles.activeTab} to="/strategy/monthly">
            Monthly anchors
          </Link>
          <Link to="/strategy/rolling-monthly">Rolling 5/30/60</Link>
        </nav>
      </header>
      {error ? (
        <div className={styles.error}>
          <b>Some monthly evidence is unavailable</b>
          <span>{error}</span>
        </div>
      ) : null}
      {loadingSources > 0 ? (
        <div className={styles.loading}>
          Loading monthly evidence progressively… {4 - loadingSources}/4 sources
          ready
        </div>
      ) : null}
      {evaluationsLoading ? (
        <div className={styles.loading}>
          Loading the all-stock rejection ledger on request…
        </div>
      ) : null}
      <>
        <div className={styles.context}>
          <strong>
            {rows.length} visible / {allRows.length} total
          </strong>
          <label>
            Selection
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
            >
              <option value="SELECTED">Selected entries</option>
              <option value="REJECTED">Not selected</option>
              <option value="INCOMPLETE">Incomplete data</option>
              <option value="ALL">All evaluated stocks</option>
            </select>
          </label>
          <label>
            Failure reason
            <select
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
            >
              <option value="ALL">All reasons</option>
              {failureReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reasonLabel(reason)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entry method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="ALL">All three methods</option>
              <option value="EXPIRY">Expiry</option>
              <option value="MONTHLY_CLOSURE">Monthly closure</option>
              <option value="FIRST_SESSION">First session</option>
            </select>
          </label>
          <label>
            Year
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="ALL">All</option>
              {years.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="ALL">All</option>
              {Array.from({ length: 12 }, (_, i) =>
                String(i + 1).padStart(2, "0"),
              ).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            EMA9 context
            <select value={ema} onChange={(e) => setEma(e.target.value)}>
              <option value="ALL">All</option>
              <option value="ABOVE">Close above EMA9</option>
              <option value="BELOW">Close below EMA9</option>
              <option value="BODY70">≥70% candle above</option>
            </select>
          </label>
          <StockUniverseFilterBar
            compact
            profiles={profiles.payload?.records ?? []}
            filters={stockFilters}
            onChange={setStockFilters}
            count={rows.length}
          />
          <button
            type="button"
            onClick={() => csvDownload(rows, "monthly-strategy-evidence.csv")}
          >
            Download filtered CSV
          </button>
        </div>
        <section className={styles.kpis} aria-label="Monthly strategy key metrics" tabIndex={0}>
          <Kpi
            label="Evaluable entries"
            value={String(eligible.length)}
            detail={`${rows.length - eligible.length} developing / unavailable`}
          />
          <Kpi
            label="Positive at end / as-of"
            value={
              eligible.length
                ? `${((100 * winners.length) / eligible.length).toFixed(2)}%`
                : "—"
            }
            detail={`${winners.length} of ${eligible.length}`}
          />
          <Kpi
            label="₹10k each · end P&L"
            value={money(total("pnl10000"))}
            detail="Gross research path"
          />
          <Kpi
            label="Max reward / pain"
            value={`${money(total("maxProfit10000"))} / ${money(total("maxDrawdown10000"))}`}
            detail="Observed extrema, not booked P&L"
          />
        </section>
        <section className={styles.targets}>
          <header>
            <div>
              <span>TARGET CONVERSION</span>
              <h2>How often did each entry method reach +1%, +3% and +5%?</h2>
            </div>
            <small>Denominator: filtered rows with an observed path.</small>
          </header>
          <div>
            {[1, 3, 5].map((target) => {
              const hits = eligible.filter(
                (row) => row[`hit${target}` as "hit1"],
              );
              const rate = eligible.length
                ? (100 * hits.length) / eligible.length
                : 0;
              return (
                <article key={target}>
                  <b>+{target}%</b>
                  <strong>
                    {hits.length}
                    <small> / {eligible.length}</small>
                  </strong>
                  <span>{rate.toFixed(2)}%</span>
                  <i>
                    <em style={{ width: `${rate}%` }} />
                  </i>
                </article>
              );
            })}
          </div>
        </section>
        <StrategyTable
          rows={rows}
          title="All monthly entry methods in one table"
          profiles={profiles.bySymbol}
          onSelect={setSelected}
        />
      </>
      {selected ? (
        <Inspector row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </main>
  );
}

export function RollingWindowStrategyPage() {
  const profiles = useProfileIndex();
  const [payload, setPayload] = useState<any>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EvidenceRow | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [population, setPopulation] = useState("OPPORTUNITIES");
  const [failureReason, setFailureReason] = useState("ALL");
  const [stockFilters, setStockFilters] = useState<StockProfileFilters>({
    universe: "ALL",
    capBucket: "ALL",
    sector: "ALL",
  });
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        // Paint the latest 250 opportunities first, then hydrate the complete
        // historical ledger without making the initial route wait for 8 MB.
        const compact = await fetchRollingWindowDashboard(
          undefined,
          undefined,
          250,
        );
        if (active) setPayload(compact);
        const complete = await fetchRollingWindowDashboard();
        if (active) setPayload(complete);
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (active) setHistoryLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);
  const opportunityRows = useMemo<EvidenceRow[]>(
    () =>
      (payload?.rows ?? []).map(
        (raw: any): EvidenceRow => ({
          id: String(raw.candidate_id),
          entryMethod: "ROLLING_5_30_60",
          symbol: String(raw.symbol),
          period: text(raw.signal_date),
          signalDate: text(raw.signal_date),
          entryDate: text(raw.entry_date),
          entryPrice: number(raw.entry_price),
          endPrice: number(raw.path_end_price),
          endReturn: number(raw.end_return_pct),
          maxProfit: number(raw.max_profit_pct),
          maxDrawdown: number(raw.max_drawdown_pct),
          pnl10000: number(raw.pnl_10000),
          maxProfit10000: number(raw.max_profit_10000),
          maxDrawdown10000: number(raw.max_drawdown_10000),
          status: String(raw.evaluation_status),
          selectionStatus: "SELECTED",
          gapThreshold: null,
          gapPct: null,
          ema9: null,
          closeAboveEma9: null,
          candleAboveEma9Pct: null,
          hit1: truth(raw.hit_1_pct) === true,
          hit3: truth(raw.hit_3_pct) === true,
          hit5: truth(raw.hit_5_pct) === true,
          raw: { ...raw, conditions: raw.conditions },
        }),
      ),
    [payload],
  );
  const evaluationRows = useMemo<EvidenceRow[]>(
    () =>
      (payload?.evaluations ?? []).map(
        (raw: any): EvidenceRow => ({
          id: String(raw.evaluation_id),
          entryMethod: "ROLLING_5_30_60",
          symbol: String(raw.symbol),
          period: text(raw.signal_date),
          signalDate: text(raw.signal_date),
          entryDate: "",
          entryPrice: null,
          endPrice: null,
          endReturn: null,
          maxProfit: null,
          maxDrawdown: null,
          pnl10000: null,
          maxProfit10000: null,
          maxDrawdown10000: null,
          status: String(raw.selection_status),
          selectionStatus: String(
            raw.selection_status,
          ) as EvidenceRow["selectionStatus"],
          gapThreshold: null,
          gapPct: null,
          ema9: null,
          closeAboveEma9: null,
          candleAboveEma9Pct: null,
          hit1: false,
          hit3: false,
          hit5: false,
          raw: {
            ...raw,
            ...(raw.factor_values ?? {}),
            conditions: raw.conditions ?? [],
            rejection_reasons: raw.rejection_reasons ?? [],
          },
        }),
      ),
    [payload],
  );
  const allRows =
    population === "OPPORTUNITIES"
      ? opportunityRows
      : evaluationRows.filter(
          (row) => population === "ALL" || row.selectionStatus === population,
        );
  const failureReasons = useMemo(
    () => Array.from(new Set(evaluationRows.flatMap(rejectionReasons))).sort(),
    [evaluationRows],
  );
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) =>
          (failureReason === "ALL" ||
            rejectionReasons(row).includes(failureReason)) &&
          matchesStockProfile(profiles.bySymbol.get(row.symbol), stockFilters),
      ),
    [allRows, failureReason, profiles.bySymbol, stockFilters],
  );
  const summary = payload?.summary ?? {};
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>
            INDEPENDENT ROLLING RESEARCH · 5 / 30 / 60 EXCHANGE SESSIONS
          </span>
          <h1>Rolling Strategy</h1>
          <p>
            Calendar-independent signal transitions built from trailing
            60-session, 30-session, 10-session and 5-session comparisons, with
            next-session entry and a 30-session evidence horizon.
          </p>
        </div>
        <nav>
          <Link to="/strategy/monthly">Monthly anchors</Link>
          <Link className={styles.activeTab} to="/strategy/rolling-monthly">
            Rolling 5/30/60
          </Link>
        </nav>
      </header>
      {error ? (
        <div className={styles.error}>
          <b>
            {payload
              ? "Complete rolling history could not be refreshed"
              : "Rolling evidence unavailable"}
          </b>
          <span>{error}</span>
        </div>
      ) : null}
      {!payload ? (
        <div className={styles.loading}>
          Calculating rolling 5/30/60 evidence…
        </div>
      ) : (
        <>
          {historyLoading && payload.historyLimited ? (
            <div className={styles.loading}>
              Latest 250 opportunities ready · loading the complete historical
              ledger in the background…
            </div>
          ) : null}
          <div className={styles.context}>
            <strong>
              {rows.length} visible / {allRows.length}{" "}
              {payload.historyLimited ? "currently loaded" : "total"}
            </strong>
            <label>
              Population
              <select
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
              >
                <option value="OPPORTUNITIES">
                  Historical selected opportunities
                </option>
                <option value="ALL">Latest all-stock review</option>
                <option value="SELECTED">Latest newly selected</option>
                <option value="QUALIFIED_CONTINUATION">
                  Qualified · no new entry
                </option>
                <option value="REJECTED">Latest not selected</option>
                <option value="INCOMPLETE">Latest incomplete data</option>
              </select>
            </label>
            <label>
              Failure reason
              <select
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
              >
                <option value="ALL">All reasons</option>
                {failureReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reasonLabel(reason)}
                  </option>
                ))}
              </select>
            </label>
            <span>{payload.universeRule}</span>
            <span>{payload.refreshCadence}</span>
            <StockUniverseFilterBar
              compact
              profiles={profiles.payload?.records ?? []}
              filters={stockFilters}
              onChange={setStockFilters}
              count={rows.length}
            />
            <button
              type="button"
              onClick={() => csvDownload(rows, "rolling-5-30-60-evidence.csv")}
              disabled={historyLoading && population === "OPPORTUNITIES"}
            >
              Download filtered CSV
            </button>
          </div>
          <section className={styles.kpis} aria-label="Rolling strategy key metrics" tabIndex={0}>
            <Kpi
              label="Opportunities"
              value={String(summary.opportunities ?? allRows.length)}
              detail={`${summary.matured ?? 0} mature · ${summary.developing ?? 0} developing`}
            />
            <Kpi
              label="Positive at D+30 / as-of"
              value={
                summary.winRatePct == null
                  ? "—"
                  : `${Number(summary.winRatePct).toFixed(2)}%`
              }
              detail={`${summary.winners ?? 0} winners`}
            />
            <Kpi
              label="₹10k each · end P&L"
              value={money(number(summary.pnl10000))}
              detail="Gross, all evaluable transitions"
            />
            <Kpi
              label="Max reward / pain"
              value={`${money(number(summary.maxProfit10000))} / ${money(number(summary.maxDrawdown10000))}`}
              detail="Observed path extrema"
            />
          </section>
          <StrategyTable
            rows={rows}
            title="Rolling 5/30/60 signal transitions"
            profiles={profiles.bySymbol}
            onSelect={setSelected}
          />
        </>
      )}
      {selected ? (
        <Inspector row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </main>
  );
}

export function RollingMonthlyLegacyRouter() {
  const location = useLocation();
  const view = new URLSearchParams(location.search).get("view");
  if (["expiry", "absolute", "absolute-first-session"].includes(view ?? "")) {
    const method =
      view === "expiry"
        ? "EXPIRY"
        : view === "absolute-first-session"
          ? "FIRST_SESSION"
          : "MONTHLY_CLOSURE";
    return <Navigate to={`/strategy/monthly?entryMethod=${method}`} replace />;
  }
  return <RollingWindowStrategyPage />;
}
