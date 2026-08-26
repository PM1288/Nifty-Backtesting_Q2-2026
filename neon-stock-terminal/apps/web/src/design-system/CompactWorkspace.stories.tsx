import type { Meta, StoryObj } from "@storybook/react";
import { CompactStatusBand, InfoPanel, KpiCell, KpiStrip, LensNavigationBar, UnifiedContextBar } from "./CompactWorkspace";

const meta = { title: "Workbench/Compact V5", component: LensNavigationBar, parameters: { layout: "fullscreen" } } satisfies Meta<typeof LensNavigationBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LensBar: Story = { args: { active: "overview", onSelect: () => undefined, lenses: [{ id:"overview",label:"Overview"},{id:"trades",label:"Trade Evidence",count:"35"},{id:"risk",label:"Reward & Pain",count:"3 attention"}] } };
export const States = () => <div style={{display:"grid",gap:8,padding:8}}><CompactStatusBand state="warning" title="NO TRADE" reason="Nine candidates reached OFactor; none passed execution gates." metadata="10:05 IST · policy v4" info={<p>Inspect the stage funnel for exact failed rules.</p>} /><UnifiedContextBar count="35 visible" actions={<button>Export</button>} overflow={<label>Sector <select><option>All</option></select></label>}><label>Period <select><option>30D</option></select></label></UnifiedContextBar><KpiStrip><KpiCell label="Booked net" value="₹4,554.77" basis="BOOKED · net" info={<p>Governed closed fills after recorded costs.</p>} /><KpiCell label="Open gross" value="₹1,281.20" basis="OPEN ACTUAL · gross" /></KpiStrip><InfoPanel label="Methodology"><p>Definitions remain accessible by click, focus and keyboard.</p></InfoPanel></div>;
