# Today Route State Contract

## Summary

```text
/?lens=story
/?lens=sector-matrix&sector=<stable-sector-slug>
```

- Unknown/missing lens canonicalizes to `story`.
- Sector is serialized as a normalized stable slug.
- Unrelated query parameters are preserved.
- Lens and selection use router history; browser Back restores the prior state.

## Full board

```text
/full-board?universe=ALL&marketCap=ALL&sector=<slug>&sort=stable&search=&inspect=stock:INFY
```

Only options already supported by stock profiles are exposed. Unknown values canonicalize to product defaults. `inspect=sector:<slug>` and `inspect=stock:<symbol>` identify the one open quick view.

## Canonical detail routes

- Stock 360: `/analytics/stock/:symbol`
- F&O radar: `/options/intelligence`
- Sector comparison: `/?lens=sector-matrix&sector=<slug>`
- No empty sector-detail route is introduced.
