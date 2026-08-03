import { analytics } from "./index";
import type { AnalyticsParams } from "./types";

export function trackNavClick(params: AnalyticsParams) {
  analytics.track("nav_click", params);
}

export function trackModeToggle(params: AnalyticsParams) {
  analytics.track("mode_toggle", params);
}

export function trackFilterChanged(params: AnalyticsParams) {
  analytics.track("filter_changed", params);
}

export function trackWidgetExpanded(params: AnalyticsParams) {
  analytics.track("widget_expanded", params);
}

export function trackTableRowSelected(params: AnalyticsParams) {
  analytics.track("table_row_selected", params);
}

export function trackSelectContent(contentType: string, contentId: string, params: AnalyticsParams = {}) {
  analytics.track("select_content", {
    content_type: contentType,
    content_id: contentId,
    ...params
  });
}

export function trackApiErrorShown(params: AnalyticsParams) {
  analytics.track("api_error_shown", params);
}

export function trackEmptyStateViewed(params: AnalyticsParams) {
  analytics.track("empty_state_viewed", params);
}
