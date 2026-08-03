# File Merge Register

Disposition values:

- `KEEP_AS_IS`
- `ADAPT_TO_STACK`
- `CONVERT_TO_STACK_EQUIVALENT`
- `SKIP_DUPLICATE`

| Source file | Target path | Disposition | Reason | Notes |
| --- | --- | --- | --- | --- |
| `.env.example` | `services/nse_analytics_worker/.env.example` | `KEEP_AS_IS` | Runtime env template is still valid for worker use. | Used as worker env reference. |
| `AGENTS.md` | none | `SKIP_DUPLICATE` | Repo already has its own agent instructions. | Reviewed only. |
| `docker-compose.yml` | root `docker-compose.yml` | `ADAPT_TO_STACK` | Overlay compose was not used directly. | Merged service wiring into stack compose as `nse-analytics-worker`. |
| `Dockerfile` | `services/nse_analytics_worker/Dockerfile` | `ADAPT_TO_STACK` | Needed worker-only image, not full overlay app image. | Streamlit/dashboard packaging removed. |
| `INTEGRATION.md` | none | `SKIP_DUPLICATE` | Superseded by repo-local docs. | Reviewed for intent only. |
| `Makefile` | none | `SKIP_DUPLICATE` | Repo does not standardize on overlay make targets. | Not merged. |
| `README.md` | `services/nse_analytics_worker/README.overlay.md` | `ADAPT_TO_STACK` | Kept original overlay reference without making it canonical. | Stack-native README added separately. |
| `requirements.txt` | `services/nse_analytics_worker/requirements.txt` | `ADAPT_TO_STACK` | Worker does not need Streamlit/Plotly runtime. | Trimmed to compute/runtime dependencies only. |
| `agent.d/00-objective.d` | none | `SKIP_DUPLICATE` | Repo-level docs replaced overlay agent packets. | Reviewed only. |
| `agent.d/10-build-order.d` | none | `SKIP_DUPLICATE` | Build order captured in docs instead. | Reviewed only. |
| `agent.d/20-data-contracts.d` | none | `SKIP_DUPLICATE` | API contract is now repo-native. | Reviewed only. |
| `agent.d/30-verification.d` | none | `SKIP_DUPLICATE` | Validation written into repo docs. | Reviewed only. |
| `agent.d/40-dashboard.d` | none | `SKIP_DUPLICATE` | Overlay dashboard shell was not merged. | Converted into native routes. |
| `agent.d/50-analysis-catalog.d` | none | `SKIP_DUPLICATE` | Catalog intent folded into route/page design. | Reviewed only. |
| `agent.d/60-future-extensions.d` | none | `SKIP_DUPLICATE` | Future work belongs in repo docs. | Not merged. |
| `app/__init__.py` | `services/nse_analytics_worker/app/__init__.py` | `KEEP_AS_IS` | Package marker. | No changes needed. |
| `app/checks.py` | `services/nse_analytics_worker/app/checks.py` | `KEEP_AS_IS` | DQ logic remains valid. | Used directly by worker. |
| `app/cli.py` | `services/nse_analytics_worker/app/cli.py` | `ADAPT_TO_STACK` | Runtime error handling needed stack-safe rollback behavior. | Patched failure path rollback. |
| `app/config.py` | `services/nse_analytics_worker/app/config.py` | `KEEP_AS_IS` | Runtime settings model remains valid. | Used directly by worker. |
| `app/db.py` | `services/nse_analytics_worker/app/db.py` | `KEEP_AS_IS` | Migration execution logic remains valid. | Used directly by worker. |
| `app/logging_setup.py` | `services/nse_analytics_worker/app/logging_setup.py` | `KEEP_AS_IS` | Runtime logging remains valid. | Used directly by worker. |
| `app/refresh.py` | `services/nse_analytics_worker/app/refresh.py` | `KEEP_AS_IS` | Core analytics materialization logic is the value of the overlay. | Used directly by worker. |
| `app/dashboard/__init__.py` | none | `SKIP_DUPLICATE` | Streamlit dashboard package not kept. | Replaced by native web routes. |
| `app/dashboard/app.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx`, `AnalyticsFlowsPage.tsx`, `AnalyticsQualityPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Streamlit shell conflicts with existing React app. | Reimplemented as native routes. |
| `app/dashboard/helpers.py` | `apps/api/src/routes/analytics.ts` | `CONVERT_TO_STACK_EQUIVALENT` | Helper logic needed JSON API shapes, not Streamlit helpers. | Re-expressed as route query helpers. |
| `app/dashboard/assets/styles.css` | `apps/web/src/pages/AnalyticsPage.module.css` | `CONVERT_TO_STACK_EQUIVALENT` | Theme had to be merged into existing token system. | Rebuilt with repo tokens only. |
| `app/dashboard/pages/01_Overview.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Repo uses React routes. | Folded into `/analytics`. |
| `app/dashboard/pages/02_Regime_and_Breadth.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Combined into overview route. | Covered by regime history panel. |
| `app/dashboard/pages/03_Momentum_and_Breakouts.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Combined into overview route. | Covered by signal explorer. |
| `app/dashboard/pages/04_Mean_Reversion.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Low-volume signal family fits signal explorer panel. | Included in grouped signals. |
| `app/dashboard/pages/05_Delivery_and_Conviction.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` and `AnalyticsFlowsPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Split between overview and flows. | Delivery conviction appears in both summaries and flow leaders. |
| `app/dashboard/pages/06_Events_and_Flows.py` | `apps/web/src/pages/AnalyticsFlowsPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Native route translation. | Served by `/analytics/flows`. |
| `app/dashboard/pages/07_Anomalies_and_Risk.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Best represented in watchlist and grouped signals. | No separate page added. |
| `app/dashboard/pages/08_Historical_Learner.py` | `apps/web/src/pages/AnalyticsOverviewPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Native route translation. | Served by historical learner table. |
| `app/dashboard/pages/09_Data_Quality.py` | `apps/web/src/pages/AnalyticsQualityPage.tsx` | `CONVERT_TO_STACK_EQUIVALENT` | Native route translation. | Served by `/analytics/quality`. |
| `config/analysis_sections.yml` | none | `SKIP_DUPLICATE` | Sectioning was encoded directly in stack routes/pages. | Covered by route/page structure. |
| `config/data_quality_checks.yml` | `services/nse_analytics_worker/config/data_quality_checks.yml` | `KEEP_AS_IS` | Worker still consumes these checks. | Used directly by refresh validation. |
| `docs/ANALYSIS_CATALOG.md` | none | `SKIP_DUPLICATE` | Summary captured by repo docs and API/page design. | Reviewed only. |
| `docs/CODE_AGENT_VERIFICATION.md` | none | `SKIP_DUPLICATE` | Repo-local QA doc replaced it. | Reviewed only. |
| `docs/DASHBOARD_SPEC.md` | none | `SKIP_DUPLICATE` | Used as source spec for native UI. | Not copied verbatim. |
| `docs/FILE_LOGGING.md` | `services/nse_analytics_worker/README.md` | `ADAPT_TO_STACK` | Logging instructions belong with worker ops docs. | Documented in worker README. |
| `docs/HISTORICAL_DEPTH_GUIDE.md` | `docs/12_FINAL_INTEGRATION_SUMMARY.md` | `ADAPT_TO_STACK` | Historical learner notes were summarized in final integration docs. | No separate copied doc. |
| `docs/OPERATIONS_RUNBOOK.md` | `services/nse_analytics_worker/README.md` | `ADAPT_TO_STACK` | Operations belong with stack service docs. | Rewritten for stack compose usage. |
| `sql/001_control.sql` | `services/nse_analytics_worker/sql/001_control.sql` | `KEEP_AS_IS` | Core analytics schema definition is valid. | Used directly by worker migrations. |
| `sql/010_views.sql` | `services/nse_analytics_worker/sql/010_views.sql` | `KEEP_AS_IS` | Core analytics views are valid. | Used directly by worker migrations. |
| `sql/020_analysis_queries.sql` | `services/nse_analytics_worker/sql/020_analysis_queries.sql` | `KEEP_AS_IS` | Analyst starter queries remain useful. | Used as reference and migration asset. |
| `tests/test_static_files.py` | none | `SKIP_DUPLICATE` | Repo does not use the overlay Python dashboard test harness. | Validation performed through container build and Playwright instead. |

## Additional stack-native files added during merge

These files did not exist in the overlay and were created to integrate it cleanly:

- `services/nse_analytics_worker/ops/entrypoint.sh`
- `services/nse_analytics_worker/README.md`
- `apps/api/src/routes/analytics.ts`
- `apps/web/src/pages/AnalyticsPage.module.css`
- `apps/web/src/pages/AnalyticsOverviewPage.tsx`
- `apps/web/src/pages/AnalyticsFlowsPage.tsx`
- `apps/web/src/pages/AnalyticsQualityPage.tsx`
- `docs/07_INTEGRATION_DECISIONS.md`
- `docs/08_FILE_MERGE_REGISTER.md`
- `docs/10_ANALYTICS_INTEGRATION_QA.md`
- `docs/12_FINAL_INTEGRATION_SUMMARY.md`
