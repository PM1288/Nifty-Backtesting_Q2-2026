# Analytics QA

## Environment

Set these Vite variables for non-default environments:

```bash
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_CLARITY_PROJECT_ID=xxxxxxxxxx
VITE_ANALYTICS_LOG_ENDPOINT=
```

If the variables are omitted, the analytics providers stay disabled safely.

## What was instrumented

- Manual SPA page tracking for all major routes
- Sidebar and section-tab navigation
- Audience mode toggle
- Home heatmap and index-strip drills
- Market Hub, Market Story, Stocks, and Signals stock drills
- Heatmap sector filters
- Simulator runs and scenario toggles
- Simulator result views
- Option-chain refresh, compare, cadence, and series-window controls
- Lead and signup attribution persistence
- Visible error and empty/delayed state tracking
- Global client error logging

## GA4 checks

1. Open the site locally and enable GA4 DebugView for the browser.
2. Navigate through:
   - Home
   - Market Hub
   - Market Story
   - % Change / RSI / WILLR heatmaps
   - Simulator
   - Option Chain
3. Confirm only one `page_view` fires per route change.
4. Confirm these events appear when triggered:
   - `nav_click`
   - `mode_toggle`
   - `view_analysis`
   - `select_content`
   - `filter_changed`
   - `run_simulation`
   - `simulation_result_view`
   - `generate_lead`
   - `sign_up`
   - `options_refresh_clicked`
5. Confirm event params include:
   - `page_name`
   - `module`
   - `app_area`
   - `mode`
    - `auth_state`
   - `traffic_source`
   - `traffic_medium`

## Clarity checks

1. Confirm sessions appear in the Clarity project `vt3rv00fze`.
2. Filter by tags such as:
   - `page_name`
   - `module`
   - `mode`
   - `auth_state`
3. Confirm custom events appear for:
   - `simulator_run`
   - `select_content`
   - `nav_click`
   - `options_refresh_clicked`
4. Confirm safe market widgets are readable in replay:
   - tables
   - chart cards
   - heatmaps
   - stock pills
5. Confirm auth modal fields are masked.

## Operational logging checks

1. Open DevTools and force an API failure.
2. Confirm a structured `[analytics]` error is emitted for:
   - `api_error`
   - `api_request_failed`
   - `visible_error_state`
3. Force a slow request and confirm `slow_api_request` logs when fetch duration exceeds the threshold.

## Duplicate page-view guard

- Route changes are tracked from the shared shell hook.
- Auth state and mode changes update context only.
- Do not reintroduce `page_view` tracking inside individual pages or auth effects.
