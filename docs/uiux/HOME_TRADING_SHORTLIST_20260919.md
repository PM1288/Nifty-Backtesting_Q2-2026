# Home trading shortlist — 19 September 2026

## Scope

Additive collapsible Home sidebar in both current Today Summary and legacy Home.
Right-edge Trading list tag opens it; default is closed. Long and Short sections
show exact stock, selecting source(s), independent existing MWHD bull/bear ranks,
passed gates, latest price, signed daily change and source dates. Stock links open
Stock 360. No trading, strategy selection, execution or alert rules change.

Sources are explicitly **OIIS selected candidates** from the same IST day and
**fully passing MWHD routes** from that day's progression. Recommended-only,
neutral and previous-day OIIS candidates are excluded. Old progression ranks may
remain as dated context, never relabelled current selections. Other strategies
remain in their own dashboards; this is not an all-strategy census. Rank cohort
and weighting reuse the Home matrix without personal entries changing ranks.

## Personal list

Authenticated user can choose an exact tracked symbol and Long/Short. Manual
entries are labelled Personal, deduplicated per symbol/direction, removable and
limited to 100. Local browser persistence is namespaced by authenticated UID;
account change remounts the component and resets transient state. This is
**per-account, per-browser storage, not cross-device DB synchronization**. The UI
discloses this. Storage failure is visible. No entry/order API is called.

## Interaction

Auto-closes after 10 seconds with no pointer, scroll or keyboard activity.
Editing or keyboard focus keeps it open to avoid destroying ongoing input.
Escape and Close close immediately, restoring the trigger focus. Pointer hover
alone does not open it. Responsive width is bounded to viewport minus 20px;
only the sidebar body scrolls. Existing paper alert launcher remains below it.
OIIS reads occur on opening, then at most once/minute while open; no mousemove
requests. Existing progression/live quote data is reused.

## Validation and release

Pure tests cover date eligibility, exact selected state, recommendation exclusion,
side separation, source deduplication, malformed storage and user key isolation.
Browser runner: `tools/playwright/home-trading-shortlist.mjs`.
Candidate attempt01 failed because the local default used legacy Home; sidebar
was subsequently added to both Home variants. Do not count this attempt as pass.
Attempt02 verified seven interactions but failed Escape when focus remained on
the external opening tag; fixed by an open-only Escape listener. Mobile title
overlap was fixed with a header-safe inset. Attempt03 captured a transient blank
local app after development restart and remains failed, not a pass. Attempt04 on
the current Home variant passed all eight checks: default collapsed, validated
addition, reload persistence, mobile fit, editing focus preservation, removal,
10-second idle close and Escape. Desktop/mobile screenshots visually inspected.
Evidence: `/home/novius2/NIFTY50/UX-v2/home-shortlist-20260919-attempt04`.
Web 210/210 tests, API 245/245 tests, both typechecks/builds and canonical gate
passed. Personal-account isolation is unit-tested and enforced by remount/key;
two real-account switching and cross-device persistence are not browser-tested.
No cross-device synchronization is claimed. OIIS reads have a 30-second timeout
and explicit Retry; no strategy selection was manufactured for screenshot tests.
First application release: `aa0b555`. Follow-up source review found the progression
API deliberately falls back up to seven days for intraday bars while its envelope
uses today's date. The sidebar additionally requires all three current intraday
bucket timestamps to be today's IST date before labelling MWHD selected today.
Ranks retain the source intraday timestamp. A regression verifies a freshly dated
envelope cannot turn yesterday's completed gates into today's selection.
Final deployed SHA/public verification will be appended after release.

No database migrations. Rollback removes the two sidebar mounts/component only;
personal browser values are harmless and can remain. Existing Home data, MWHD,
Stock 360, OIIS, paper permissions, notifier and navigation are preserved.
