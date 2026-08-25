# Paper trade event notifier — 23 August 2026

## Outcome

The authenticated application shell now exposes a compact bottom-right Paper alerts control on every dashboard. It expands on hover for discovery, opens on click, and automatically opens when a new paper entry fill or analytical target hit appears while the dashboard is active.

The panel shows at most the five latest matching events with symbol, event class, IST timestamp, summary and a contextual link into Paper Trading. A global header switch provides `Muted` and `Speak` states. Speak uses the machine/browser-native Web Speech API to narrate the entry condition and governed exit/target condition, accompanied by the gentle two-tone alert. Muted cancels queued narration and suppresses both narration and the pop. The preference is retained in local storage and defaults to Muted on a new browser profile.

## Canonical evidence and semantics

- Source table: `paper_trading.trade_events`.
- Browser API: authenticated `GET /v1/paper/notifications?limit=5`.
- Entry event: `com.papertrading.trade_leg.opened.v1` (actual paper fill; not merely an accepted intent).
- Target event: `com.papertrading.target_track.closed.v1` (one consolidated analytical target event for the processed bar).
- The endpoint performs the event-type filter before `LIMIT`, ensuring the response is the latest five qualifying records rather than five records from a broader feed.
- The UI seeds the first response as known history. Existing records therefore remain inspectable but never create a false startup popup or sound.
- Subsequent responses are deduplicated by durable event ID.
- Poll interval: 5 seconds while authenticated and visible; React Query does not poll an inactive background tab.
- The API supplies structured narration text only. It returns no audio, contacts no TTS provider and stores no voice recording.
- Entry narration identifies symbol, side, entry price, quantity, strategy condition and available governed intraday/swing exit levels.
- Target narration identifies the reached level(s), observed price, actual execution status and whether higher analytical targets remain active.

## UX and accessibility

- Collapsed launcher: 42 px circular control; hover/focus expands its text label.
- New event: panel auto-opens for nine seconds. Pointer interaction cancels auto-close so the user can inspect it.
- Click/touch provides the same access as hover.
- `Escape` closes the panel without activating any action.
- A polite live region announces only a newly detected entry/target event, not market ticks.
- Entry and target states have both text and distinct icons; colour is supplementary.
- Mobile placement clears the persistent bottom navigation and respects safe-area insets.
- Reduced-motion mode disables panel/launcher motion.
- Browsers block sound before the first user gesture. The header switch is itself a user gesture; the notifier also prepares Web Audio on the first pointer or keyboard interaction and never requests intrusive autoplay permission.
- If the browser has no native `speechSynthesis` support, the header switch is disabled and labelled as unavailable; no fallback/cloud TTS is attempted.

## Files

- API/query: `neon-stock-terminal/apps/api/src/routes/mobileNotifications.ts`
- API test: `neon-stock-terminal/apps/api/src/routes/mobileNotifications.test.ts`
- OpenAPI/Swagger: `neon-stock-terminal/docs/openapi/paper-trade-notifications.openapi.yaml`
- Shell integration: `neon-stock-terminal/apps/web/src/components/chrome/AppShell.tsx`
- Component: `neon-stock-terminal/apps/web/src/components/chrome/PaperTradeNotifier.tsx`
- Styles: `neon-stock-terminal/apps/web/src/components/chrome/PaperTradeNotifier.module.css`
- Pure event helpers: `neon-stock-terminal/apps/web/src/components/chrome/paperTradeNotifications.ts`
- Web tests: `neon-stock-terminal/apps/web/tests/paperTradeNotifications.test.ts`

## Validation

- Production database evidence before deployment: 35 durable entry events and 85 durable target events.
- Web typecheck: pass.
- API typecheck: pass.
- Web tests: 45/45 pass, including startup replay protection and new-event detection.
- API tests: 118/118 pass, including event-type SQL filtering, five-item cap and contextual route mapping.
- Web production build: pass.
- Authenticated production Playwright: 18/18 checks passed across 1440×900, 1366×768 auto-event/native-speech simulation and 390×844 mobile. The checks verify the default Muted state, the header-only Speak switch, browser-native narration content and immediate cancellation on mute. The simulation intercepted only the browser response and browser speech interface; it did not insert or modify a paper event.
- Screenshots and machine-readable results: `docs/uiux/screenshots/paper-event-notifier-20260823/`.
- Production image: `sha256:6f21f39ca3ddaeaf4803e3c10d4be204700fc0180461001467d68c23721c34ad`; `trading-stack-novius2-n50-dashboard-1` verified healthy after cutover.

## Rollback

The immediate pre-voice image is tagged `trading-stack-n50-dashboard:rollback-pre-paper-voice-20260823` and resolves to `sha256:5e8cac34dd6ecc12d0eaf594e6ab8ef1a5137ff41ef22fddbe8adce09ae041da`. Recreate only the `n50-dashboard` service from that image; no database migration or paper-trading service rollback is required because the feature is read-only and additive.
