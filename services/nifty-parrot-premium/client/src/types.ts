export type MarketSession = {
  open: string;
  close: string;
  t: number; // 0..1
  asOfIso: string;
};

export type NiftyPoint = {
  t: number;
  time: string;
  value: number;
  changePct: number;
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
  value: number;
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
  rsi: number;
  dailySeries: DailyPoint[];
  /** % change from open for each minute slot (len=mins) */
  minuteSeries: number[];
  /** RSI-like intraday line, 30..70 range (len=mins) */
  rsiSeries: number[];
};

export type RsiHeatmap = {
  minutes: string[];
  symbols: string[];
  values: number[][];
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
