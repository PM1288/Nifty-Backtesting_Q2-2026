import React from "react";
import type { DashboardPayload } from "../types";
import { TreeCanvas } from "./TreeCanvas";

export type SceneTuning = {
  leafMinSize: number;
  leafMaxSize: number;
  neutralBand: number;
  redHue: number;
  greenHue: number;
  saturation: number;
  windMultiplier: number;
  aoStrength: number;
  shadowSoftness: number;
  canopyDensity: number;
};

export function PremiumTreeScene3D({
  data,
  tuning,
  selectedSector,
  timeT
}: {
  data: DashboardPayload;
  tuning: SceneTuning;
  selectedSector: string | null;
  timeT: number;
}) {
  return (
    <TreeCanvas
      data={data}
      timeT={timeT}
      windMul={tuning.windMultiplier}
      selectedSector={selectedSector}
      onHoverLeaf={() => {
        // TreeCanvas already handles a full premium tooltip internally.
      }}
    />
  );
}
