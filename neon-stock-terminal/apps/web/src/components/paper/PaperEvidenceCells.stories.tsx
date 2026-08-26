import type { Meta, StoryObj } from "@storybook/react";
import {
  ActionCell,
  CapitalCell,
  CarryCell,
  CommentsCell,
  DirectionCell,
  EconomicsCell,
  HorizonCell,
  QualityCell,
  RewardPainCell,
  StrategyCell,
  TargetOutcomeCell,
  TimeInTradeCell,
  TradeIdentityCell,
} from "./PaperEvidenceCells";

const meta = { title: "Paper Trading/Evidence cell geometry", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Fixture({ density }: { density: "dense" | "comfortable" | "audit" }) {
  return <div data-density={density} style={{padding:16,overflow:"auto",background:"#f5f8fc"}}><table style={{borderCollapse:"collapse",tableLayout:"fixed",width:"max-content"}}><tbody>
    <tr>
      <TradeIdentityCell primary="PAYTM" secondary="One 97 Communications Ltd." detail="OIIS_LIVE · LONG" supporting="BUY then SELL" metadata="Opened 26 Aug · 12:01" />
      <DirectionCell direction="LONG" primary="LONG" secondary="Bought first" />
      <StrategyCell primary="RSI / Williams %R" secondary="Existing pullback trigger" detail="RSI_WILLR" />
      <CapitalCell groupStart primary="₹12,47,942.50" secondary="F&O qty: 725 × ₹1,721.30" detail="₹1,99,670.80" supporting="₹2L: 116 shares" metadata="₹329 cash" />
      <EconomicsCell tone="negative" primary="−₹3,842.50" secondary="OPEN" detail="Open unrealised gross" supporting="725 / 725 qty remains" metadata="₹2L scaled: −₹614.80" />
      <TargetOutcomeCell groupStart state="HIT" primary="✓ HIT" secondary="26 Aug · 12:32" detail="₹3,743.83" supporting="₹2L: ₹599.01" />
      <HorizonCell groupStart state="developing" primary="1 / 5 DAYS" secondary="MFE +0.39%" detail="MAE −0.32%" supporting="DEVELOPING" />
      <TimeInTradeCell primary="D0" secondary="1 trading session" detail="Since 26 Aug · 12:01" />
      <RewardPainCell groupStart tone="positive" primary="₹12,066.25" secondary="+1.58% to date" detail="₹2L: ₹3,161.85" />
      <CarryCell tone="negative" primary="−₹5,206.00" secondary="At ₹1,714.12" detail="Marked 15:29" supporting="₹2L: −₹1,364" />
      <QualityCell groupStart grade="GOOD_MEDIUM" tone="positive" primary="80.25% · GOOD_MEDIUM" secondary="4 / 7 targets hit" detail="1 open" supporting="Analytical horizon: GOOD" />
      <CommentsCell primary="3 comments" secondary="Latest: Review entry timing" detail="View / Add" />
      <ActionCell><button type="button">View</button></ActionCell>
    </tr>
    <tr>
      <TradeIdentityCell primary="INFY" secondary="—" detail="—" supporting="—" metadata="—" />
      <DirectionCell direction="SHORT" primary="SHORT" secondary="Sold first" />
      <StrategyCell primary="Manual / unspecified" secondary="—" />
      <CapitalCell groupStart primary="₹0.00" secondary="—" detail="—" supporting="—" metadata="—" />
      <EconomicsCell primary="₹0.00" secondary="BOOKED" detail="—" supporting="—" metadata="—" />
      <TargetOutcomeCell groupStart state="OPEN" primary="○ OPEN" secondary="Tracking" detail="—" supporting="—" />
      <HorizonCell groupStart state="mature" tone="negative" primary="MATURE" secondary="MFE —" detail="MAE —" supporting="—" metadata="—" />
      <TimeInTradeCell primary="—" secondary="—" detail="—" />
      <RewardPainCell groupStart tone="negative" primary="−₹0.00" secondary="—" detail="—" />
      <CarryCell primary="—" secondary="No current mark" detail="—" supporting="—" />
      <QualityCell groupStart primary="—" secondary="0 / 7 targets hit" detail="7 open" supporting="Analytical horizon: —" />
      <CommentsCell primary="0 comments" secondary="+ Add note" />
      <ActionCell><button type="button">View</button></ActionCell>
    </tr>
  </tbody></table></div>;
}

export const DenseMaximumAndMinimum: Story = { render: () => <Fixture density="dense" /> };
export const ComfortableMaximumAndMinimum: Story = { render: () => <Fixture density="comfortable" /> };
export const AuditMaximumAndMinimum: Story = { render: () => <Fixture density="audit" /> };
