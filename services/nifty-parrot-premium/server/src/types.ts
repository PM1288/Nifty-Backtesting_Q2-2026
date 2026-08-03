export type MarketSession = {
  open: string;  // "09:15"
  close: string; // "15:30"
  /** 0..1 position of asOf within [open, close] */
  t: number;
  asOfIso: string;
};

export type NiftyPoint = {
  t: number;           // 0..1
  time: string;        // "HH:MM"
  value: number;
  changePct: number;   // % vs open
};

export type Nifty50 = {
  value: number;
  changePct: number;
  series: NiftyPoint[];
};

export type Vix = {
  value: number;
};

export type NiftyRsi = {
  value: number; // 0..100 but we clamp for viz to [30,70]
};

export type SectorStat = {
  sector: string;
  symbolCount: number;
  avgChangePct: number;
};

export type DailyPoint = {
  date: string;      // "YYYY-MM-DD"
  day: string;       // "Mon"
  close: number;
  changePct: number; // % vs previous close
};

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  lastPrice: number;
  dayChangePct: number;
  rsi: number; // 30..70 (for heatmap)
  dailySeries: DailyPoint[];
  /** % change from open for each minute slot (len=mins) */
  minuteSeries: number[];
  /** RSI-like intraday line, 30..70 range (len=mins) */
  rsiSeries: number[];
};

export type RsiHeatmap = {
  minutes: string[];      // len = mins
  symbols: string[];      // len = 100
  values: number[][];     // [stockIndex][minuteIndex] RSI 30..70
};

export type DashboardPayload = {
  session: MarketSession;
  nifty50: Nifty50;
  vix: Vix;
  niftyRsi: NiftyRsi;
  n100: {
    sectors: SectorStat[];
    stocks: Stock[];
  };
  rsiHeatmap: RsiHeatmap;
};
