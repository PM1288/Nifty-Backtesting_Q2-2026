export const PAPER_EVIDENCE_SLOTS = ["primary", "secondary", "detail", "supporting", "metadata"] as const;

export const PAPER_EVIDENCE_ROW_HEIGHTS = {
  dense: 82,
  comfortable: 98,
  audit: 112,
} as const;

export const PAPER_EVIDENCE_COLUMN_WIDTHS = {
  trade: 220,
  direction: 100,
  strategy: 150,
  capital: 170,
  economics: 150,
  target: 105,
  horizon: 115,
  time: 130,
  rewardPain: 130,
  carry: 145,
  quality: 155,
  comments: 130,
  action: 72,
} as const;

export const PAPER_EVIDENCE_PRESETS = ["ALL", "EXECUTION", "TARGETS", "HORIZON", "RISK", "QUALITY"] as const;
export const PAPER_EVIDENCE_DENSITIES = ["COMFORTABLE", "DENSE", "AUDIT"] as const;
