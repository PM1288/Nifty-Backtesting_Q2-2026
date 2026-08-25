# OIIS lineage

`/strategy/oiis-live` → `OiisLivePage.tsx` → OIIS API client →
`oiisLive.ts` → `oiis_live` service/policy/selector → point-in-time market,
institutional and execution evidence → persisted runs/candidates/watchlist →
candidate cards, factor evidence, history and authorised paper preview.

The daily selection date is evaluated in `Asia/Kolkata`. OIIS is independent
from Monthly, Rolling, Long Options and NIFTY weekly options strategies.
