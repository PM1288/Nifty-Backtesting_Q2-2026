# Accessibility results

Implemented semantic tablist/tab state, tables/rows, focusable buttons for sectors and stocks, signed text beside movement icons, numeric breadth labels, visible focus treatment, Escape close, close button, and focusable portal quick views. Mobile quick view becomes a full-width sheet. Reduced motion is honored.

Keyboard and responsive journeys were exercised by the Playwright regression at 1920×1080, 1440×900, 1024×768 and 390×844. The same regression runs `@axe-core/playwright` against Market Story and Full Board: all eight scans report zero serious or critical violations in `after-screenshots/results.json`. The existing repository-wide lint baseline remains failing independently of this feature.
