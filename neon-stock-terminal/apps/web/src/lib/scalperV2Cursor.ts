export type ScalperV2CrosshairSyncAction = "ORIGIN_OWNS" | "RECEIVE" | "CLEAR" | "HOLD";

export function scalperV2CrosshairSyncAction(input: {
  paneId: string;
  source: string | null;
  hasCrosshair: boolean;
  mode: "latest" | "hover" | "locked";
}): ScalperV2CrosshairSyncAction {
  if (input.hasCrosshair && input.source === input.paneId) return "ORIGIN_OWNS";
  if (input.hasCrosshair) return "RECEIVE";
  return input.mode === "locked" ? "HOLD" : "CLEAR";
}
