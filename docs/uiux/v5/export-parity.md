# Compact UI V5 export parity

## Preservation rule

V5 changes presentation only. Export functions continue to consume the filtered canonical arrays, never virtualised or visible DOM rows.

| Surface | Export | V5 result |
|---|---|---|
| Today sector board | Existing board/open-full-board flows | Preserved |
| Monthly | Filtered CSV for every matching row | Preserved; universe/cap/sector filters now share the context row |
| Rolling 5/30/60 | Filtered CSV for every matching row | Preserved |
| Trendlyne | Six-month filtered recommendation CSV | Preserved |
| Long Options | Existing evidence/export routes | Preserved |
| Paper Full Evidence | Current-view/full evidence export | Preserved |
| Paper Simple View | CSV and Excel-compatible export of the complete filtered dataset | Preserved; the settled audit renders all 44 filtered records at all four viewports and unit tests reconcile the declared export fields |
| Paper Factor Analysis | Standalone interactive HTML and analytical exports | Preserved in Factor Analysis lens |

Existing unit coverage confirms that Simple View exports contain exactly the declared evidence fields and do not convert missing observations to zero. No export selector or calculation was changed by V5.

## Remaining verification

Server-generated export byte-for-byte comparison is covered by the existing route regression suite and must be repeated after production deployment. Runtime screenshots are deliberately excluded from Git under repository policy.
