# Home Preservation Evidence

The Home route is protected by construction:

- `AppShell` applies `data-ui-generation="trading-v2"` only when the pathname is not `/`.
- Home continues to use the legacy navigation catalogue and default workspace theme.
- All V2 tokens and global compatibility rules are descendants of the V2 scope.
- The Home route/component and `LandingPage.module.css` were not modified.
- Browser regression asserts Home has no V2 scope at 430, 1024, 1440 and 1920 px.

Baseline screenshots are in the ignored Playwright evidence directory `tools/playwright/output/playwright/ui-redesign-v2-before/`; post-change screenshots are in `tools/playwright/output/playwright/ui-v2-regression-local/` and deployment evidence directories. Dynamic market data can prevent byte-identical screenshots, so the hard guard is scope absence plus unchanged Home source.
