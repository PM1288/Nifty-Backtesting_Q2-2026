# Full-Path Ladder V2 Source Review

## Supplied authority

All three files in `/home/novius2/NIFTY50/Fix-strategy` were reviewed. The
Markdown and DOCX specify the same central rule: an execution fill must never
truncate path-quality evidence. The supplied JSON policy was copied into
`platform/nifty_stratlab/config/evaluation/` as the runtime-readable policy.

Source SHA-256 values:

- Markdown: `c6444415028fcd0be81d352397f0e22d5c4e330f676e13347c73318e1932d517`
- DOCX: `9bcd02a8a51c6d713bf5d7856d79c8a56976cb4d489977de80f778ffb2037135`
- JSON: `0723e2256ac201091607a23252f0be89715288fcda1c5e47614452c153e1dee0`

## Defects found and treatment

| Location | Previous behavior | Research impact | Treatment |
|---|---|---|---|
| `evaluation/common_exit.py` | Broke on I030 or S100 and sliced the observed bars at the execution exit. | Higher rewards and later adverse movement disappeared. | Reduced to a compatibility facade over the V2 path evaluator and a separate execution service. |
| OIIS replay writer | Exported target/adverse JSON produced from the truncated path. | Full-run target counts described the sell scenario, not entry quality. | Exports independent path, reward, adverse and checkpoint CSVs and persists normalized V2 rows. |
| OIIS identity | Repeated real runs reused the same path primary key. | A correct rerun could fail with a unique-key collision. | Namespaced each entry path by replay run while preserving a separate evidence hash. |
| First V1.2 execution adapter | Froze both research and execution at D+5. | Correct D+5 labels, but a no-timeout S100 sale after D+5 was wrongly shown open. | V1.3 freezes only research labels; the execution scenario continues to S100 or the data boundary. |
| `simulation/engine.py` and private runners | Some consumers still model only selected execution exits and do not export normalized V2 ladder tables. | They cannot yet be compared as V2 ladder studies. | Not silently certified. They must use the canonical evaluator/export contract before a V2 comparison. |
| API/UI | Existing pages do not yet expose the normalized V2 ladder tables as a dedicated matrix. | CSV/PostgreSQL evidence is correct but UI acceptance from the supplied specification is incomplete. | Explicitly listed as open work; no false UI-complete claim. |

The original `common-exit-contract` documentation remains the authority for the
no-stop/no-timeout execution scenario. This V2 folder supersedes its old claim
that ladder events are limited to the actual execution path.
