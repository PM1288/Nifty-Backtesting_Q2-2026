export type Direction = 'up' | 'down' | 'neutral';
export type AccentToken = 'green' | 'red' | 'white';

export interface IntradayHero {
  index_name: string;
  last_value: number | null;
  change_pct: number | null;
  as_of: string | null;
  direction: Direction;
  accent_token: AccentToken;
  arrow: '▲' | '▼' | '•';
}

export interface IntradaySummaryTableRow {
  label: string;
  value: string | number | boolean | null;
  direction: Direction;
  accent_token: AccentToken;
  arrow: '▲' | '▼' | '•';
  note?: string | null;
}

export interface IntradaySummaryPayload {
  trade_date: string;
  index_code: string;
  as_of: string;
  hero: IntradayHero;
  state: Record<string, unknown>;
  summary_table: IntradaySummaryTableRow[];
  breadth: Record<string, unknown>;
  leaders: {
    top_strength?: Array<Record<string, unknown>>;
    top_weakness?: Array<Record<string, unknown>>;
    residual_leaders?: Array<Record<string, unknown>>;
    vwap_control_breakouts?: Array<Record<string, unknown>>;
    headline_spikes?: Array<Record<string, unknown>>;
    catch_up_candidates?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  ticker_tape: Array<Record<string, unknown>>;
  accent_token: AccentToken;
  footer_disclaimer: string;
  generated_at?: string;
  meta?: Record<string, unknown>;
}

export interface IntradaySectionPayload {
  trade_date: string;
  index_code: string;
  section_slug: string;
  title: string;
  direction: Direction;
  accent_token: AccentToken;
  summary_metrics: Record<string, unknown>;
  highlights: string[];
  narrative?: string | null;
  rows: Array<Record<string, unknown>>;
  charts: Array<Record<string, unknown>>;
  historical_context: Record<string, unknown>;
  generated_at?: string;
}

export interface IntradayStockPayload {
  trade_date: string;
  as_of: string;
  symbol: string;
  sector_name?: string | null;
  last_price?: number | null;
  change_pct_from_prev_close?: number | null;
  change_pct_from_open?: number | null;
  dominant_signal?: string | null;
  direction: Direction;
  accent_token: AccentToken;
  tags: string[];
  conclusion?: string | null;
  payload: Record<string, unknown>;
  explanation?: Record<string, unknown>;
  history_context?: Record<string, unknown>;
  series: Array<Record<string, unknown>>;
}
