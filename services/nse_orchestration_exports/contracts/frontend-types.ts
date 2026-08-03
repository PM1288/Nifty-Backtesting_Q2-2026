export type Direction = "up" | "down" | "neutral";
export type AccentToken = "green" | "red" | "white";

export interface TickerItem {
  symbol: string;
  last_value: number | null;
  change_pct: number | null;
  direction: Direction;
  accent_token: AccentToken;
  arrow: "▲" | "▼" | "•";
}

export interface HeroSummary {
  index_name: string;
  last_value: number | null;
  delta_value: number | null;
  change_pct: number | null;
  as_of: string | null;
  direction: Direction;
  accent_token: AccentToken;
  arrow: "▲" | "▼" | "•";
}

export interface LeaderboardRow {
  symbol: string;
  security_name?: string | null;
  change_pct: number | null;
  close_price?: number | null;
  direction: Direction;
  accent_token: AccentToken;
  arrow: "▲" | "▼" | "•";
  sector_name?: string | null;
}

export interface SectorGroup {
  sector_name: string;
  items: LeaderboardRow[];
}

export interface SummaryCard {
  section_slug: string;
  title: string;
  summary_value?: number | null;
  summary_text?: string | null;
  direction: Direction;
  accent_token: AccentToken;
}

export interface DashboardSummaryPayload {
  trade_date: string;
  generated_at: string;
  is_stale: boolean;
  accent_token: AccentToken;
  hero: HeroSummary;
  top_gainers: LeaderboardRow[];
  top_losers: LeaderboardRow[];
  sector_groups: SectorGroup[];
  ticker_tape: TickerItem[];
  summary_cards: SummaryCard[];
  footer_disclaimer: string;
  educational_purpose_only: true;
}

export interface AnalysisDetailRow {
  symbol?: string;
  title: string;
  subtitle?: string | null;
  direction: Direction;
  accent_token: AccentToken;
  score?: number | null;
  confidence?: number | null;
  primary_metric?: number | null;
  secondary_metric?: number | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
}

export interface DashboardSectionPayload {
  trade_date: string;
  section_slug: string;
  title: string;
  direction: Direction;
  accent_token: AccentToken;
  generated_at: string;
  summary_metrics: Record<string, unknown>;
  highlights: string[];
  narrative: string | null;
  rows: AnalysisDetailRow[];
  historical_context?: Record<string, unknown> | null;
}
