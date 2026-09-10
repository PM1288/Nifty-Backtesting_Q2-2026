# Morning View participant options comparison — 10 September 2026

## Delivered scope

The existing MANEESH `Morning View` now shows source-backed index-option
position comparisons for FII, Pro, Client and DII. No separate dashboard or
participant dataset was created.

- The summary table shows the preceding retained report, current report and
  signed change for net calls, net puts and the existing options proxy.
- The expanded `Yesterday comparison` table shows current and previous call
  long/short contracts, put long/short contracts, their calculated nets and the
  options proxy.
- The API comparison boundary now preserves the corresponding previous raw
  inputs and signed changes. Missing prior reports remain null and display as
  unavailable rather than zero.
- `Client` remains the official exchange-reported participant class and is
  labelled `Client (reported)`. It is not asserted to be retail-only.
- The formulas are visible in the interface:
  - net calls = index-call long contracts - index-call short contracts;
  - net puts = index-put long contracts - index-put short contracts;
  - options proxy = net calls - net puts;
  - change = current report - preceding retained report.

This is outstanding participant open interest in contracts. It is not premium
cash flow, a proprietary account position, or a trade recommendation.

## Verification

- Web typecheck and production build: PASS.
- Web tests: PASS, 140/140.
- API typecheck and production build: PASS.
- API tests: PASS, 194/194, including complete and missing-baseline call/put
  comparison cases.
- Canonical repository gate: PASS.
- Authenticated Chromium against the deployed gateway: 64/64 checks PASS,
  zero failures.
- The retained production comparison is report `2026-09-09` against prior
  report `2026-09-08`; FII, Pro, Client and DII are all comparable.
- Browser evidence (not committed):
  `/tmp/morning-participant-comparison-9d8e20b-final/`.

## Release

- Canonical commit: `9d8e20b` on pushed `master`.
- Dashboard image:
  `sha256:255b3e701f52bbfca959d47c4447eda4debf494f7714986685fcc9997b50ce19`.
- Rollback image:
  `trading-stack-n50-dashboard:pre-morning-participant-9d8e20b`.
- Only `trading-stack-novius2-n50-dashboard-1` was recreated. It is healthy
  with zero restarts. Local/public health and Morning View routes return HTTP
  200.

