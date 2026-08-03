import { analytics } from "./index";
import type { AnalyticsParams } from "./types";

export type IndicatorAnalyticsContext = {
  indicator_slug: string;
  scenario_id?: string;
  capital_mode?: string;
  as_of_date?: string;
  selected_stock?: string;
  chart_id?: string;
  page_path?: string;
};

function trackIndicatorEvent(eventName: string, params: AnalyticsParams) {
  analytics.track(eventName, params);
}

export function trackIndicatorPageView(params: AnalyticsParams) {
  trackIndicatorEvent("indicator_page_view", params);
}

export function trackIndicatorSectionView(params: AnalyticsParams) {
  trackIndicatorEvent("indicator_section_view", params);
}

export function trackIndicatorScrollDepth(params: AnalyticsParams) {
  trackIndicatorEvent("indicator_scroll_depth", params);
}

export function trackIndicatorPageEngagement(params: AnalyticsParams) {
  trackIndicatorEvent("indicator_page_engagement", params);
}

export function trackStrategyScenarioChange(params: AnalyticsParams) {
  trackIndicatorEvent("strategy_scenario_change", params);
}

export function trackCapitalModeChange(params: AnalyticsParams) {
  trackIndicatorEvent("capital_mode_change", params);
}

export function trackStockSelected(params: AnalyticsParams) {
  trackIndicatorEvent("stock_selected", params);
}

export function trackAssumptionsOpened(params: AnalyticsParams) {
  trackIndicatorEvent("assumptions_opened", params);
}

export function trackLimitationsOpened(params: AnalyticsParams) {
  trackIndicatorEvent("limitations_opened", params);
}

export function trackHowToReadOpened(params: AnalyticsParams) {
  trackIndicatorEvent("how_to_read_opened", params);
}

export function trackChartRangeChange(params: AnalyticsParams) {
  trackIndicatorEvent("chart_range_change", params);
}

export function trackTableSortChange(params: AnalyticsParams) {
  trackIndicatorEvent("table_sort_change", params);
}

export function trackTableFilterChange(params: AnalyticsParams) {
  trackIndicatorEvent("table_filter_change", params);
}

export function trackCtaOpenSimulator(params: AnalyticsParams) {
  trackIndicatorEvent("cta_open_simulator", params);
}
