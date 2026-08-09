# UI Failure Modes and Recovery

| Failure | Required UI behaviour | Recovery |
|---|---|---|
| API unavailable | Preserve page identity, show explicit unavailable state | Retry the bounded query; link to Operations |
| Data stale | Show timestamp and labelled stale state; do not imply live | Await ingestion recovery or inspect Data Quality |
| Partial dataset | Display coverage/limitation beside the result | Use only qualified evidence |
| Authentication absent | Show guest/read-only state | User explicitly opens sign-in |
| Run failed | Retain run identity and error; never replace last good evidence silently | Inspect Run Monitor and rerun with same configuration |
| Chart unavailable | Preserve metric definition and provide tabular/empty state | Retry or download governed evidence |
| Mobile table overflow | Contain horizontal scrolling inside the table region | Use column priority or export CSV |
| Unknown route | Show the existing not-found surface | Use stable navigation |

Notification, data and research failures must not be expressed only by colour. The presentation layer does not fabricate substitute values.
