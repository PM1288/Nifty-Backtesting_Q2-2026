# Scalper V2 cumulative OI versus timestamp — 11 September 2026

## Outcome

The existing `view=scalper_v2` now includes a fifth, full-width analytical
chart titled **Cumulative OI vs timestamp**. Its X axis is the option-chain
snapshot timestamp in IST and its Y axis is summed provider-native open
interest. The blue line is cumulative CE OI and the yellow line is cumulative
PE OI.

Here, cumulative means the sum across every strike retained in one captured
snapshot. It is not a running sum of earlier timestamps. The UI states the
timestamp count, complete-point count and observed strike count so a changing
or partial capture cannot be mistaken for a complete exchange-expiry chain.
Missing OI makes that side unavailable for the timestamp rather than zero.

## Data path

The existing read-only charts API now returns additive
`cumulativeOiHistory` evidence for the selected underlying and expiry. Each
point is grouped from one canonical `option_chain_snapshots` record and all of
its stored `option_chain_legs`. CE and PE are summed separately only when every
captured contract for that side has an observed OI value. Source, snapshot ID,
strike count, contract counts, observation counts, scope and unit remain in the
JSON response and existing Scalper V2 JSON export.

No collector, schema, signal rule, option identity, measurement arithmetic or
order permission changed.

## Verification

- Web typecheck and production build: PASS.
- Full web tests: PASS, 148/148.
- API typecheck and production build: PASS.
- Full API tests: PASS, 196/196.
- Authenticated isolated Chromium: PASS, 15/15.
- Live-backed candidate evidence for NIFTY 15 September 2026 expiry on the
  retained 10 September session: 192 timestamps, 192/192 complete, 13 captured
  strikes per snapshot.
- Visual inspection: PASS; blue CE and yellow PE lines are visible across the
  IST time axis on a shared provider-native OI scale.
- Screenshot:
  `/tmp/scalper-v2-cumulative-oi/scalper-v2-nifty-guides-signed-oi-and-clear.png`
  (runtime evidence outside source control).

The isolated candidate was stopped after testing. Production deployment was
not performed and remains a separate authorised release action.
