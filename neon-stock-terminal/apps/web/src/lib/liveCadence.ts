// Live workstation reads stay mounted and revalidate in place. These cadences
// remain slower than the broker stream so browser polling cannot amplify feed
// traffic or remount the chart engines.
export const SCALPER_V2_PRICE_REFRESH_MS = 15_000;
export const SCALPER_V2_OPTION_HISTORY_REFRESH_MS = 30_000;
export const SCALPER_PROGRESSION_REFRESH_MS = 15_000;

