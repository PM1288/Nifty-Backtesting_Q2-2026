import type { Meta, StoryObj } from "@storybook/react";
import { MarketSummaryStrip } from "./TodayShared";
import type { TodayModel } from "./todayModel";

const quote = (symbol: string, name: string, last: number, changePct: number) => ({ symbol, name, last, change: last * changePct / 100, changePct });
const model: TodayModel = {
  asOf: "2026-08-28T10:00:00+05:30", market: { isOpen: true, label: "OPEN" },
  indices: { nifty50: quote("NIFTY50", "NIFTY 50", 25200, .42), bankNifty: quote("BANKNIFTY", "BANK NIFTY", 54800, -.18), indiaVix: quote("INDIAVIX", "INDIA VIX", 12.4, -1.2) },
  breadth: { advancing: 132, declining: 70, neutral: 6, total: 208 }, sectors: [], allStocks: [], strongestMovers: [], weakestMovers: [], oiisStrongest: [], oiisWeakest: [],
  derivatives: { universe: "ALL_ACTIVE_NSE_FNO_CONTRACTS", contractCount: 0, underlyingCount: 0, observedContractCount: 0, observedTodayCount: 0, anomalyCount: 0, bigAskCount: 0, bigBidCount: 0, excessPriceMoveCount: 0, wideSpreadCount: 0, asOf: null, anomalies: [] },
};

const meta = { title: "Today Revamp/Market Summary Strip", component: MarketSummaryStrip, parameters: { layout: "fullscreen" } } satisfies Meta<typeof MarketSummaryStrip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Current: Story = { args: { model } };
export const Compact: Story = { args: { model, compact: true } };
