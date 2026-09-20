export type ScalperV2CrosshairSyncAction = "ORIGIN_OWNS" | "RECEIVE" | "CLEAR" | "HOLD";

export type ScalperV2CursorEvent = {
  time: number | null;
  source: string;
};

type ScalperV2CursorListener = (event: ScalperV2CursorEvent) => void;

/**
 * Canvas-to-canvas cursor transport. Native panes subscribe once and receive
 * physical pointer changes before React performs the slower inspector render.
 */
export class ScalperV2CursorCoordinator {
  private readonly listeners = new Map<string, ScalperV2CursorListener>();

  subscribe(paneId: string, listener: ScalperV2CursorListener): () => void {
    this.listeners.set(paneId, listener);
    return () => {
      if (this.listeners.get(paneId) === listener) this.listeners.delete(paneId);
    };
  }

  publish(event: ScalperV2CursorEvent): void {
    for (const [paneId, listener] of this.listeners) {
      if (paneId !== event.source) listener(event);
    }
  }
}

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
