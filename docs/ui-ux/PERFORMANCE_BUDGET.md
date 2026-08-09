# Frontend Performance Budget

| Measure | Budget |
|---|---|
| Initial application JS (gzip) | Track and prevent unreviewed growth; route-heavy features stay lazy |
| Route chunks | Lazy loaded; charts do not enter Home unless used |
| Fonts | Existing local font packages only; no runtime third-party font request |
| Data refresh | React Query policies remain bounded; no new polling loop |
| Charts | ECharts retained and lazy route chunks preserved |
| Mobile | No document-level horizontal overflow |
| Motion | Reduced-motion support mandatory |

This redesign adds CSS and a small shared primitive module. It does not add a UI framework, runtime state library or duplicate chart package.
