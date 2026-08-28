# Today API and Field Map

| UI meaning | Existing field/source | State |
|---|---|---|
| NIFTY/BANK/VIX level and change | `OverviewResponse.indices.*` plus live quotes | Available |
| Market open/closed | `OverviewResponse.market` | Available |
| Data as-of | `OverviewResponse.asOf`, quote timestamp | Available |
| Breadth | Sign counts derived from visible `Quote.changePct` | Presentation selector |
| Sector move | Mean member `changePct`, matching current Today behavior | Presentation selector |
| Sector breadth | Sign counts from sector member quotes | Presentation selector |
| Sector rank | Current sector move ordering | Presentation selector |
| Previous rank/rank delta | No overview field | Unavailable (`—`) |
| Market regime | No overview field | Unavailable (`Not classified`) |
| Contribution points | No authoritative overview field | Unavailable; use Sector Leadership fallback |
| Conviction | No canonical overview scale | Unavailable (`—`) |
| Strong/weak movers | Sector/global member `changePct` | Available; label Movers |
| OIIS opportunity | `oiisState`, `oiisScore`, `oiisOFactor`, `oiisXFactor` | Available when populated |
| Risk counts | `OverviewResponse.derivatives.*Count` | Available |
| Top anomalies | `OverviewResponse.derivatives.anomalies` | Available |
| Stock LTP/day facts/volume | `Quote` and `GET /v1/stocks/:symbol?range=1D` | Available when populated |
| Stock intraday series | `StockDetailResponse.intraday` | Available on detail request |
| Index/sector sparkline | Not in overview | Unavailable; no fake series |
| Local stock logo/name/sector/cap/universe | `stock-profiles.json` | Available |

All numeric selectors use null-safe checks. A numeric zero remains zero; null/undefined renders `—`.
