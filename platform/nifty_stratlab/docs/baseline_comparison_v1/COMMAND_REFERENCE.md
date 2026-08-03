# Command Reference

```bash
./scripts/strategy_suite.sh validate
./scripts/strategy_suite.sh golden
./scripts/strategy_suite.sh smoke
./scripts/strategy_suite.sh monitor last
./scripts/strategy_suite.sh verify last
./scripts/strategy_suite.sh compare last
./scripts/strategy_suite.sh export last
./scripts/strategy_suite.sh ui last
```

After smoke acceptance:

```bash
./scripts/strategy_suite.sh pilot
./scripts/strategy_suite.sh one-year
./scripts/strategy_suite.sh stress
```

Run the full qualified period only after pilot, restart, determinism and independent-review gates pass:

```bash
./scripts/strategy_suite.sh full
```

The CLI contract to implement is:

```text
python -m nifty_stratlab.cli comparison preflight --config <file>
python -m nifty_stratlab.cli comparison run --config <file>
python -m nifty_stratlab.cli comparison monitor --id <id|last>
python -m nifty_stratlab.cli comparison verify --id <id|last>
python -m nifty_stratlab.cli comparison show --id <id|last>
python -m nifty_stratlab.cli comparison export --id <id|last>
python -m nifty_stratlab.cli comparison cancel --id <id|last>
python -m nifty_stratlab.cli comparison resume --id <id|last>
```
