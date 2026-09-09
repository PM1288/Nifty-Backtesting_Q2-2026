import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TradingAnalyticsTradeLog } from "./TradingAnalyticsTradeLog";
import type { Observation } from "../lib/tradeObservation";

// Test-only, deliberately named fixture. Never imported by runtime code.
const fixture: Observation = {
  signal_key: "TEST_ONLY",
  underlying_symbol: "FIXTURE",
  trade_date: "2026-09-09",
  direction: "CALL",
  interval_minutes: 5,
  entry_end: "2026-09-09T04:10:00Z",
  setup_end: "2026-09-09T04:05:00Z",
  option_symbol: "FIXTURE-CE",
  ce_symbol: "FIXTURE-CE",
  pe_symbol: "FIXTURE-PE",
  underlying_entry_open: 100,
  option_entry_open: 10,
  ce_entry_open: 10,
  pe_entry_open: 11,
  delivery_status: "SUPPRESSED_STALE",
  condition_evidence: {
    precursor_colour_required: false,
    underlying_body70_pass: true,
    underlying_precursors: [{ open: 99, close: 98, ema9: 99.5, colour: "RED" }],
  },
  indicator_evidence: {
    underlying: {
      rsi14: 0,
      macd: -0.123456,
      macd_signal9: null,
      macd_histogram: 0,
    },
  },
  outcome_evidence: {
    "15m": {
      maturity: "DEVELOPING",
      thesis_alignment: "OPPOSED",
      ce: {
        state: "OBSERVED",
        endpoint: 9,
        endpoint_change_pct: -10,
        max: 12,
        max_change_pct: 20,
        min: 8,
        min_change_pct: -20,
        observed_minutes: 3,
      },
    },
    "30m": { maturity: "DEVELOPING" },
    eod: { maturity: "DEVELOPING" },
  },
  unknown_future_field: { source: "retained", value: null },
};
function Gallery({
  empty = false,
  missing = false,
  preset = "P&L comparison",
}: {
  empty?: boolean;
  missing?: boolean;
  preset?: string;
}) {
  const [client] = useState(() => {
    const c = new QueryClient({
      defaultOptions: { queries: { enabled: false } },
    });
    c.setQueryData(["scalper-trade-log", "limit=5000"], {
      rows: empty
        ? []
        : [
            missing
              ? {
                  ...fixture,
                  option_symbol: null,
                  outcome_evidence: {},
                  delivery_status: "FAILED",
                }
              : fixture,
          ],
      count: empty ? 0 : 1,
      paperOrdersEnabled: false,
      version: "TEST_ONLY",
    });
    return c;
  });
  return (
    <MemoryRouter
      initialEntries={[
        `/?view=trade-log&logPreset=${encodeURIComponent(preset)}`,
      ]}
    >
      <QueryClientProvider client={client}>
        <TradingAnalyticsTradeLog />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
const meta: Meta<typeof Gallery> = {
  title: "Trading Analytics/Trade observations",
  component: Gallery,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Developing: Story = {};
export const ProfitAndLossComparison: Story = {};
export const MissingAndFailed: Story = { args: { missing: true } };
export const Empty: Story = { args: { empty: true } };
export const IndicatorsZeroAndMissing: Story = {
  args: { preset: "Indicators" },
};
export const AllEvidence: Story = { args: { preset: "Full evidence" } };
