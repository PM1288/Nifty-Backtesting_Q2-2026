import type { Meta, StoryObj } from "@storybook/react";
import { TradingAnalyticsMorning } from "./TradingAnalyticsMorning";
const meta: Meta<typeof TradingAnalyticsMorning> = {
  title: "Trading Analytics/Morning evidence sheet",
  component: TradingAnalyticsMorning,
  args: {
    activity: [],
    participants: [],
    morning: {
      matrix: "DATA_INSUFFICIENT",
      cash: [],
      cashNet: null,
      cashSign: null,
      knowledgeState: "UNVERIFIED",
    },
    smartapi: { expiry: null, metrics: { oiPcr: null, volumePcr: null } },
    onInspect: () => {},
    onStructure: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Missing: Story = {};
export const ArithmeticZeroAndNegative: Story = {
  args: {
    activity: [
      {
        fii_derivatives: "INDEX FUTURES",
        net_crore: 0,
        canonical_sign: "Neutral",
      },
      {
        fii_derivatives: "INDEX OPTIONS",
        net_crore: -150,
        canonical_sign: "Sell",
      },
    ],
    participants: [
      {
        client_type: "FII",
        net_futures: -20,
        options_proxy: 0,
        futures_long_pct: 50,
      },
    ],
  },
};
