# V2.0 Bounded Runbook

```bash
cd /home/novius2/trading-stack
./scripts/nifty_stratlab_test.sh
./scripts/nifty_stratlab_migrate_test.sh
```

Generate the non-accepting audit. Exit code 3 means the programme is correctly not
accepted:

```bash
set +e
platform/nifty_stratlab/.venv/bin/nifty-stratlab programme-audit \
  --output platform/nifty_stratlab/outputs/v2_programme_audit_20260802.json
test "$?" -eq 3
set -e
```

For the deployed Compose job, add `--persist-dsn-env TRADING_DATABASE_URL` and use
an `/artifacts/...` output path. This stores the 50 evidence rows without changing
their owner-acceptance field.

Run safe frozen commands:

```bash
platform/nifty_stratlab/.venv/bin/nifty-stratlab phase1 preflight \
  --config platform/nifty_stratlab/config/programme.runtime.example.yml \
  --output platform/nifty_stratlab/outputs/v2_preflight_20260802

platform/nifty_stratlab/.venv/bin/nifty-stratlab phase2 strategy-validate \
  --manifest platform/nifty_stratlab/config/strategies/rsi_1m_daily45_v1.yml \
  --output platform/nifty_stratlab/outputs/v2_strategy_validation

platform/nifty_stratlab/.venv/bin/nifty-stratlab phase5 pack-verify \
  --zip platform/nifty_stratlab/outputs/rsi_1m_daily45_reliance_20250501_20250731/research_pack.zip \
  --output platform/nifty_stratlab/outputs/v2_pack_verification
```

Do not bypass exit code 4 from a gated command. Resolve the prerequisite, update
evidence, obtain owner acceptance, and only then implement/enable its execution path.
