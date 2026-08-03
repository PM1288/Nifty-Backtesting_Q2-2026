# Analytics and Attribution

## Environment

Set these public web env vars:

```bash
VITE_GA_MEASUREMENT_ID=G-K82ZDQ7XYN
VITE_CLARITY_PROJECT_ID=xxxxxxxxxx
VITE_MATOMO_BASE_URL=/n50/matomo/
VITE_MATOMO_SITE_ID=1
```

If `VITE_GA_MEASUREMENT_ID` is missing, GA4 stays disabled and analytics calls are a no-op for Google. The same no-op behavior applies to Clarity if `VITE_CLARITY_PROJECT_ID` is missing.
If the Matomo values are missing, Matomo stays disabled safely as well.

For the current stage/prod Docker setup on this machine, the compose stack now builds both web apps with:

```bash
N50_GA_MEASUREMENT_ID=G-K82ZDQ7XYN
```

If the measurement ID changes later, update that env value and rebuild `n50-dashboard` and `n50-dashboard-stage`.

Matomo is deployed on this machine as a secondary tracker behind the dashboard proxy:

```bash
N50_MATOMO_PROXY_BASE_URL=http://matomo:80
N50_MATOMO_BASE_URL_PROD=/n50/matomo/
N50_MATOMO_BASE_URL_STAGE=/n50-stage/matomo/
N50_MATOMO_SITE_ID_PROD=1
N50_MATOMO_SITE_ID_STAGE=2
```

Separate site IDs are intentional. PROD and STAGE must not share the same Matomo site.

## What is tracked

Page and engagement:
- `page_view`
- `page_dwell`
- `view_analysis`

Business events:
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
- `generate_lead`
- `sign_up`
- `download_report`
- `cta_click`

Existing product events remain in place for navigation, tabs, filters, tables, auth, trust board, option chain, and backtesting flows.

## Matomo

Matomo runs as a secondary analytics system alongside GA4 and Clarity.

Current tracking behavior:
- SPA page views via `setCustomUrl` + `trackPageView`
- custom events mirrored from the shared analytics layer
- heartbeat tracking enabled for time-on-page quality
- internal link tracking enabled
- proxy-safe tracking through the dashboard app paths
- PROD and STAGE tracked as separate Matomo sites

Matomo custom dimensions are constrained by the live schema to five slots total. The deployed design uses:

Configured visit-level custom dimensions:
- `Source Host`
- `Locale` (`en-latn`, `hi-deva`, `mr-latn`, etc.)
- `Audience Mode`

Configured action-level custom dimensions:
- `Page Family`
- `Section Name`

`Instrument`, `simulation_type`, and `auth_state` are still present in event payloads and labels, but they are not reserved as Matomo custom dimensions.

The SQL used to configure the Matomo site split and custom dimensions is stored in:

```bash
ops/matomo/001_visit_custom_dimensions.sql
ops/matomo/002_action_custom_dimensions.sql
ops/matomo/003_stage_site.sql
```

Recommended Matomo analysis workflow:
- use `Visitors > Visits log` for raw event tracing
- use `Behaviour > Events` for event-name trends
- use custom-dimension reports for source-host / locale / audience-mode segmentation
- use campaign/acquisition reports for UTM analysis

Latest verified local Matomo surfaces:
- admin UI: `http://localhost:19091/`
- PROD tracker path: `https://m.nifty50today.co.in/n50/matomo/`
- STAGE tracker path: `https://stage.nifty50today.co.in/n50-stage/matomo/`

## Attribution storage

The app captures first-touch and last-touch attribution in first-party `localStorage` for 90 days.

Captured fields:
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `utm_id`
- `utm_source_platform`
- `document.referrer`

Behavior:
- first-touch is set once on the first tagged/referral landing and kept for 90 days
- last-touch is updated on later tagged/referral landings
- direct/internal visits do not overwrite an existing non-direct touch

Signup persistence stores these fields in `app_auth_signup_profile`:
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`
- `first_touch_content`
- `first_touch_term`
- `first_touch_id`
- `first_touch_source_platform`
- `first_touch_referrer`
- `last_touch_source`
- `last_touch_medium`
- `last_touch_campaign`
- `last_touch_content`
- `last_touch_term`
- `last_touch_id`
- `last_touch_source_platform`
- `last_touch_referrer`

## UTM builder

Use:

```bash
cd neon-stock-terminal
node scripts/generate-utm.mjs --base_url=https://m.nifty50today.co.in/n50/ --utm_source=youtube --utm_medium=video_description --utm_campaign=weekly_market_story
```

Values are lowercased, slugified, URL-encoded, and empty params are omitted.

Example presets:
- YouTube video description:
  `--utm_source=youtube --utm_medium=video_description`
- YouTube pinned comment:
  `--utm_source=youtube --utm_medium=pinned_comment`
- Reddit post:
  `--utm_source=reddit --utm_medium=post`
- Reddit comment:
  `--utm_source=reddit --utm_medium=comment`
- X post:
  `--utm_source=x --utm_medium=post`
- Telegram channel:
  `--utm_source=telegram --utm_medium=channel_post`
- WhatsApp share:
  `--utm_source=whatsapp --utm_medium=share`

Prebuilt production channel links are stored in:

```bash
docs/analytics/utm-links.md
docs/analytics/social-media.md
```

The broader Matomo measurement plan is documented in:

```bash
docs/analytics/matomo-measurement-plan.md
```

## Testing

1. Set `VITE_GA_MEASUREMENT_ID`.
2. Open the app with a tagged URL, for example:
   - `https://m.nifty50today.co.in/n50/?utm_source=youtube&utm_medium=video_description&utm_campaign=weekly_market_story`
   - `https://m.nifty50today.co.in/n50/?utm_source=reddit&utm_medium=post&utm_campaign=launch&utm_content=india_investments`
3. Verify in GA4 Realtime and DebugView:
   - `page_view` on initial load
   - `page_view` on SPA route changes
   - `view_analysis` when analysis pages load
   - `run_simulation` on simulator submit
   - `simulation_result_view` after successful simulator results load
   - `generate_lead` and `sign_up` on signup success path
4. Verify signup persistence in `app_auth_signup_profile`.
5. Verify Matomo:
   - `Visits in real-time` shows the visit
   - `Visitors > Visits log` shows page views and custom events
   - custom dimensions show `Source Host`, locale token, audience mode, page family, and section name

## GA4 custom dimensions to create manually

Property:
- `527210034`

Measurement ID:
- `G-K82ZDQ7XYN`

Create these event-scoped custom dimensions in GA4 Admin:
- `analysis_type`
- `simulation_type`
- `strategy_name`
- `timeframe`
- `instrument`
- `lead_source`
- `report_type`

Admin path:
- Admin
- Data display
- Custom definitions
- Create custom dimension

Use the event parameter name exactly as listed above.

## Privacy guardrails

- Do not send email, phone number, display name, or free-text form inputs to GA4.
- Attribution data stored in the DB is non-PII campaign metadata only.
