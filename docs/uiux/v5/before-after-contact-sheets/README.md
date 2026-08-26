# Before/after evidence index

Runtime PNGs are intentionally not committed because the repository policy forbids generated screenshots and runtime exports. Reproducible local captures are written to:

- `docs/uiux/v5/current-screenshots/`
- `docs/uiux/v5/after-screenshots/`
- `docs/uiux/v5/full-route-screenshots/`
- `docs/uiux/v5/before-after-contact-sheets/` (generated Home, OIIS and Paper desktop pairs)

Use `tools/playwright/compact-v5-audit.mjs` with the authenticated local or deployed target. The JSON density results and this documentation are the durable Git evidence; images remain local deployment evidence.
