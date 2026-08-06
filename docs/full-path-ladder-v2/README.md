# Full-Path Ladder Evaluation V2

This folder is the canonical low-context handoff for the correction requested in
`/home/novius2/NIFTY50/Fix-strategy`. The correction separates two questions:

1. What prices did an accepted entry reach from its actual fill through D+5?
2. When would one named execution policy have sold and released capital?

The first question never stops at a target. It emits six reward rows, six
adverse rows and D0 through D+5 checkpoints for every accepted entry. The
second question consumes that immutable evidence but may continue beyond D+5
under the no-timeout I030-else-S100 sell policy. D+6 cannot rewrite a D+5 label.

Canonical full run: `53b5bb32-6a33-470f-9884-8613fa18ad21`.

Read the source review, completion report, evidence index and limitations in
this folder before comparing any earlier result.
