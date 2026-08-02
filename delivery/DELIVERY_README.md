# NIFTY Backtesting Platform — Five-Phase Code Delivery

**Delivery version:** 1.0  
**Issue date:** 2 August 2026  
**Status:** Reference implementation complete; target-repository, PostgreSQL and full historical-data validation remain mandatory.

## 1. What this delivery is building

The programme converts the existing Novius2 trading estate into one reusable backtesting and research platform for:

- NIFTY 50 cash-equity intraday and swing strategies;
- configurable ₹2,00,000-per-stock capital scenarios;
- net-profit targets such as ₹500 intraday and ₹1,000 swing after execution charges;
- point-in-time historical strategy replay;
- reverse opportunity discovery and out-of-sample probability calibration;
- buying-only NIFTY and stock-option research using actual option premiums;
- historical/online feature parity; and
- checksummed research ZIP packs for human financial analysts.

The supplied SmartAPI collector remains the live-ingestion boundary. This delivery does **not** place broker orders and does not replace the collector.

## 2. Why the implementation is split into five phases

The phases are cumulative. Each phase is a sequential overlay into the recommended bounded package:

```text
<TARGET_REPO>/platform/nifty_stratlab
```

A later phase must not create its own alternative calendar, fee formula, indicator implementation, fill model or run ledger. It must consume the contracts established by the preceding phases.

| Phase | Delivery ZIP | Main outcome | Prerequisite |
|---|---|---|---|
| 1 | `NIFTY_BACKTEST_PHASE_01_DATA_FOUNDATION_V1.0.zip` | Qualified point-in-time data, calendars, expiries, manifests and PostgreSQL adapters | None |
| 2 | `NIFTY_BACKTEST_PHASE_02_ECONOMICS_SIMULATOR_V1.0.zip` | Exact costs, net-target solver, indicator registry, strategy SDK and event simulator | Phase 1 gate |
| 3 | `NIFTY_BACKTEST_PHASE_03_RESUMABLE_REPLAY_V1.0.zip` | Deterministic runs, shards, checkpoints, experiment ledger, metrics and publication guard | Phases 1–2 gates |
| 4 | `NIFTY_BACKTEST_PHASE_04_DISCOVERY_CALIBRATION_V1.0.zip` | Executable opportunity labels, reverse discovery, walk-forward testing and calibrated probabilities | Phases 1–3 gates |
| 5 | `NIFTY_BACKTEST_PHASE_05_OPTIONS_PARITY_PACKS_V1.0.zip` | Actual-premium option replay, Greeks/IV diagnostics, historical/online parity and research packs | Phases 1–4 gates plus qualified option history |

## 3. Existing environment assumed by the integration prompts

The phase prompts require the coding agent to inspect and verify the actual target environment rather than blindly assuming paths. The supplied baseline references are:

```text
Historical stock CSVs:
/home/novius2/data/nifty-50-minute-data/aaditya555

Historical index/sector/VIX CSVs:
/home/novius2/data/nifty-50-minute-data/debashis74017

FII/DII source estate:
/home/novius2/data/fii-dii-and-nifty-historical-study-july-2023

PostgreSQL:
Database: tradingdb
Connection: TRADING_DATABASE_URL
Test connection: TRADING_TEST_DATABASE_URL
```

The code is designed to consolidate and adapt the existing Go, Python, SQL and TypeScript implementation. It is not a greenfield instruction to delete or replace the current application.

## 4. Contents of every phase ZIP

Each phase contains:

```text
README.md                      Human starting point
SOURCE_BASIS.md                Existing evidence and legacy paths used
PHASE_PLAN.md                  Scope, features, work packages and release gate
INTEGRATION_MAP.md             Existing-code reuse/replacement/quarantine map
ACCEPTANCE_CRITERIA.md         Evidence-based completion checklist
CODEX_PROMPT.md                Detailed high-context Codex integration prompt
LOW_CONTEXT_TASK.md            Concise task for a low-context coding agent
APPLY_OVERLAY.py/.sh/.ps1      Safe overlay installer with dry-run support
RUN_CODEX.sh/.ps1              Non-interactive Codex runner
RUN_LOW_CONTEXT_AGENT.sh/.ps1  Concise-agent runner
VERIFY_PHASE.sh/.ps1           Phase tests and smoke verification
MANIFEST.json                  File hashes for the phase bundle
overlay/                       Additive code, tests, contracts and migration
```

## 5. Recommended execution procedure

### 5.1 Create or use the development branch

All integration work should occur on:

```text
DEV_PM_CODE
```

Do not expose credentials in prompts, logs or commits. Do not push unless a configured remote and authentication already exist.

### 5.2 Inspect the overlay without changing the target repository

Linux/macOS:

```bash
unzip NIFTY_BACKTEST_PHASE_01_DATA_FOUNDATION_V1.0.zip
cd PHASE_01_DATA_FOUNDATION_QUALIFICATION
bash APPLY_OVERLAY.sh /path/to/target/repo --dry-run
```

Windows PowerShell:

```powershell
Expand-Archive .\NIFTY_BACKTEST_PHASE_01_DATA_FOUNDATION_V1.0.zip
cd .\PHASE_01_DATA_FOUNDATION_QUALIFICATION
.\APPLY_OVERLAY.ps1 -TargetRepo C:\path\to\repo -DryRun
```

### 5.3 Run the detailed Codex integration prompt

Linux/macOS:

```bash
bash RUN_CODEX.sh /path/to/target/repo
```

Windows PowerShell:

```powershell
.\RUN_CODEX.ps1 -TargetRepo C:\path\to\repo
```

The runner feeds `CODEX_PROMPT.md` to Codex in non-interactive workspace-write mode. The prompt tells the agent to inspect the real repository, preserve current collectors and data, test migrations on a disposable database, reconcile affected legacy outputs and create a phase completion report.

### 5.4 Run the concise low-context task

Linux/macOS:

```bash
bash RUN_LOW_CONTEXT_AGENT.sh /path/to/target/repo
```

Windows PowerShell:

```powershell
.\RUN_LOW_CONTEXT_AGENT.ps1 -TargetRepo C:\path\to\repo
```

Use this only for a narrowly scoped agent. The detailed Codex prompt remains the authoritative integration instruction.

### 5.5 Verify the phase after integration

Linux/macOS:

```bash
bash VERIFY_PHASE.sh /path/to/target/repo
```

Windows PowerShell:

```powershell
.\VERIFY_PHASE.ps1 -TargetRepo C:\path\to\repo
```

The verifier confirms package installation, phase-specific tests and the smoke test. The phase is not production-accepted until the target-environment criteria in `ACCEPTANCE_CRITERIA.md` also have saved evidence and reviewer approval.

### 5.6 Repeat sequentially

Apply and accept Phase 1 before Phase 2, then continue in order. Phase 3 is the first complete historical replay service. Phase 4 adds discovery/calibration. Phase 5 adds governed buying-only option research and portability to the later live/reporting architecture.

## 6. Integrated reference implementation

`NIFTY_BACKTEST_INTEGRATED_REFERENCE_V1.0.zip` contains the cumulative reference package after all five overlays. It is useful for:

- code review;
- local synthetic demonstrations;
- understanding the final module boundaries;
- running all reference tests together; and
- comparing a target-repository integration against the intended result.

Local verification:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
python -m pytest -q
```

Optional PostgreSQL support:

```bash
pip install -e '.[postgres,dev]'
export TRADING_DATABASE_URL='postgresql://...'
nifty-stratlab inspect-postgres
```

## 7. Non-negotiable implementation controls

1. Use point-in-time universe, instrument, contract, session and feature state.
2. A completed bar may influence only a later entry; no same-bar look-ahead.
3. Use one effective-dated cost engine and one minimum-valid-tick target solver.
4. Use actual option premium bars for option P&L; Greeks are diagnostic inputs only.
5. Preserve every attempted strategy/run and failed validation in the experiment ledger.
6. A failed or incomplete run may never replace the last-good published run.
7. Resume by deterministic shard/checkpoint rather than restarting a multi-year run.
8. Display a value as probability only after chronological out-of-fold calibration.
9. Keep historical replay/discovery compute separate from the lightweight live collector path.
10. Do not enable broker order placement in these five phases.

## 8. Delivery-level verification already completed

The isolated reference delivery passed:

- 22 cumulative automated tests;
- all five phase smoke tests;
- manifest verification for every phase bundle;
- sequential installation of all five overlays into a clean mock Git repository; and
- the final cumulative suite after sequential installation.

See `VERIFICATION_REPORT.md` and `FINAL_VERIFICATION_LOG.txt` for exact evidence.

## 9. What remains to be validated in the target environment

The following are intentionally not claimed as complete by the reference delivery:

- integration into the actual Novius2 repository and deployment services;
- migrations against a disposable copy of the real `tradingdb` schema;
- qualification of the full historical CSV estate;
- inspection and normalisation of the actual FII/DII workbook contents;
- contract-note reconciliation of the fee engine;
- row-level reconciliation against current legacy backtest outputs;
- cross-language parity for any retained Go/TypeScript calculations;
- actual options-history backfill and source/licence confirmation;
- ten-year performance/load testing on the reference server; and
- paper/shadow/live order workflow and risk approval.

These are phase release-gate activities, not reasons to bypass the phased design.

## 10. Primary documents

- `NIFTY_BACKTESTING_FIVE_PHASE_IMPLEMENTATION_ROADMAP_V1.0.docx`
- `NIFTY_BACKTESTING_FIVE_PHASE_IMPLEMENTATION_ROADMAP_V1.0.md`
- `five_phase_roadmap.json`
- `VERIFICATION_REPORT.md`
- `SHA256SUMS.txt`
