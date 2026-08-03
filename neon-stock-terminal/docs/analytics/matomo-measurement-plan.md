# Matomo Measurement Plan

Last updated: 2026-03-16

This document explains how Matomo should be used in the N50 product now that it is running as a secondary tracker alongside GA4 and Microsoft Clarity.

## Tracking role

Use the three systems with clear responsibilities:

- GA4
  - external acquisition and broad product analytics
- Clarity
  - qualitative replay and struggle review
- Matomo
  - self-hosted event trail, page-flow tracing, campaign inspection, and internal product analysis

Matomo is not replacing GA4 or Clarity. It is the privacy-controlled secondary system that gives us raw event visibility and operational traceability on our own infrastructure.

## Site split

Matomo must track PROD and STAGE separately.

- PROD site ID: `1`
- STAGE site ID: `2`

Current mapped hosts:

- PROD: `https://m.nifty50today.co.in/n50/`
- STAGE: `https://stage.nifty50today.co.in/n50-stage/`

Do not merge stage traffic into the production Matomo site.

## Core implementation rules

- track every React route as an SPA page view
- keep heartbeat enabled
- use content/event tracking for long-form learning sections instead of relying only on page time
- keep first-touch and last-touch attribution in app storage and DB
- keep event names stable
- do not send PII
- keep stage/prod split at the Matomo site level

These rules follow the Matomo guidance for SPA tracking, heartbeat-based active time, event tracking, and carefully planned custom dimensions.

## Current event coverage

### Global

- `page_view`
- `page_dwell`
- `cta_click`
- `audience_mode_change`
- `locale_language_change`
- `locale_digits_change`
- `local_tab_change`
- `accordion_expand`
- `table_sort_change`
- `table_filter_change`
- `auth_cta_click`
- `auth_gate_view`
- `auth_gate_open_manual`
- `auth_gate_dismiss`
- `login`
- `logout`
- `sign_up`
- `generate_lead`

### Learning and simulation

- `view_analysis`
- `run_simulation`
- `simulation_result_view`
- `strategy_lab_section_view`
- `strategy_lab_engagement`
- `simulator_section_view`
- `simulator_page_engagement`
- `simulator_input_change`
- `simulator_detail_expand`
- `option_chain_section_view`
- `option_chain_engagement`
- `market_hub_section_view`
- `market_hub_engagement`
- `home_section_view`
- `home_engagement`
- `backtesting_strategy_detail_section_view`
- `backtesting_strategy_detail_engagement`
- indicator-specific events such as:
  - `indicator_page_view`
  - `indicator_section_view`
  - `indicator_scroll_depth`
  - `strategy_scenario_change`
  - `capital_mode_change`
  - `stock_selected`
  - `assumptions_opened`
  - `limitations_opened`
  - `how_to_read_opened`
  - `chart_range_change`
  - `cta_open_simulator`

### Global workspace interactions

- `sidebar_nav_click`
- `heatmap_filter_change`
- `heatmap_row_focus`
- `stock_search`
- `compare_metric_change`
- `option_chain_view`
- `option_chain_tab_change`
- `expiry_change`
- `strike_window_change`
- `equilibrium_point_hover`
- `equilibrium_crossover_click`
- `diagnostics_open`
- `ladder_row_focus`
- `overlay_previous_snapshot_toggle`

### Backtesting

- `backtesting_filter_change`
- `strategy_select`
- `universe_mode_change`
- `capital_mode_change`
- `date_range_change`
- `stock_detail_open`

### Option chain

- `option_chain_view`
- `option_chain_tab_change`
- `expiry_change`
- `atm_combo_window_change`
- `option_chain_section_view`
- `option_chain_engagement`

### Trust and exports

- `download_report`
- `trust_board_alert_viewed`
- `route_monitor_viewed`

### Feedback

- `feedback_view`
- `feedback_submit`
- `feedback_submit_failed`

## Dimension model

### Visit-scoped dimensions

- `Source Host`
- `Locale`
- `Audience Mode`

These help explain why engagement differs between locale, audience mode, and stage/prod entry host.

### Action-scoped dimensions

- `Page Family`
- `Section Name`

The live Matomo schema only supports five custom-dimension slots, so `Instrument`, `Simulation Type`, and auth state stay in event payloads and labels rather than consuming extra dimension IDs.

## Page families to use in reporting

These are the stable product buckets to use when reading Matomo reports:

- `overview`
- `market`
- `heatmaps`
- `learning`
- `backtesting`
- `system`

## Most important questions Matomo should answer

### Product discovery

- which landing pages lead to deeper product exploration?
- which traffic sources move users from home into strategy learning?
- which locales and digit modes correlate with lower engagement?

### Learning flow

- which sections of Strategy Lab are actually consumed?
- which indicator pages lead to simulator opens?
- which simulator inputs are changed before a successful result render?
- which option-chain tabs, ladders, and overlays hold attention?
- which mobile learning flows drop before a meaningful interaction?

### Operational trust

- how often is the Trust Board opened?
- which export/report actions are actually used?
- which routes show unusual error or drop-off patterns?

## Recommended reports and funnels

Build these first in Matomo:

### Funnel: Discover -> Learn -> Simulate

1. home or market hub
2. strategy lab or indicator detail
3. open simulator
4. simulator result rendered

### Funnel: Indicator learning

1. indicators landing
2. indicator detail
3. scenario change
4. simulator open

### Funnel: Engagement -> account

1. learning page viewed
2. auth CTA clicked
3. sign up
4. feedback viewed
5. feedback submitted

### Dashboard cuts

- by source host
- by locale + digits
- by auth state
- by page family
- by section name

## Page-specific measurement priorities

### Home and Market Hub

- which entry cards lead to deeper exploration?
- which heatmap filters and focused rows get used most?
- which supporting metrics or leaders lists drive the next click?
- which home sections are actually consumed before the next route change?
- which market-hub sections are viewed before users open leaders, strategy, or stock detail?

### Strategy Lab

- evidence blocks viewed
- evidence chart engaged
- explanation block opened
- bridge CTA to simulator clicked

### Simulator

- form started
- parameter changes by control
- scenario loaded
- results rendered
- explanation/charges/ledger sections expanded

### Indicators

- landing card clicked
- indicator detail viewed
- glossary/help opened
- scenario changed
- forward-return matrix engaged
- assumptions and limitations opened
- next-step bridge cards viewed
- related heatmap bridge clicked
- simulator CTA clicked

### Option Chain

- snapshot/equilibrium/ATM combo/diagnostics tab usage
- expiry changes
- ladder row focus
- historical overlay usage
- crossover exploration

### Backtesting

- filter changes
- strategy comparison usage
- stock insight usage
- detail drill-down actions
- strategy detail sections viewed
- strategy detail page engagement measured across rules, charts, and tables

### Feedback and account surfaces

- feedback page viewed
- feedback submitted
- auth CTA clicked
- sign-up completed
- locale and digit preference changes

## Recommended next-wave Matomo capabilities

Once the current event layer is stable, the highest-value additions are:

- Funnels
  - discover -> learn -> simulate
  - indicators -> simulator
  - learning -> auth -> feedback
- Heatmaps and Session Recordings
  - best for long learning pages and mobile struggle review
- Form Analytics
  - best for simulator and any future lead/auth flows
- Custom Reports / Users Flow
  - best for product operations and stakeholder reporting

Keep GA4 as the acquisition/source-of-traffic layer and Clarity as the lightweight qualitative replay layer. Use Matomo as the self-hosted structured interaction trail and operational analytics system.

## UTM strategy

The production UTM set is in:

- [utm-links.md](./utm-links.md)

Use distinct `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_id` per channel and creative. Keep all campaign links on the production host:

- `https://m.nifty50today.co.in/n50/...`

## Privacy and safety rules

- never send email, phone number, full name, or free-text feedback message to Matomo custom dimensions or event names
- keep keystroke capture disabled in any replay tooling
- keep signed-in analytics pseudonymous via app user ID only

## Operational checklist

When changing analytics:

1. keep site IDs split between prod and stage
2. rebuild both dashboard images
3. verify `_paq`, `matomo.js`, and `matomo.php` traffic in the browser
4. verify visits and events appear in the correct Matomo site
5. verify PROD traffic is not appearing in the STAGE site and vice versa
