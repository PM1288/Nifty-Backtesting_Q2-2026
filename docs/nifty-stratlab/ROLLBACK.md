# Rollback Guide

The root is not a Git repository. Roll back additively and do not drop production
schemas as a first response.

## Disable runtime exposure

1. Remove the `nifty-stratlab` service block from `compose/compose.jobs.yml`.
2. Stop invoking Make targets `nifty-stratlab-*`.
3. Do not run root migrations 014–019 in future deployments.

## Restore backed-up files

The original copies of the initially identified affected files are under:

```text
/home/novius2/backups/nifty-backtesting/trading-stack-pre-five-phase-20260802T141051Z/files/
```

Use `diff -u` before copying any file back because humans may have edited it after
this integration.

## Reverse additive documentation/deployment edits

For pre-existing files not in that first backup set, remove only the clearly named
NIFTY StratLab additions from:

- `.gitignore`
- `Makefile`
- `compose/compose.jobs.yml`
- `docs/SOURCE_OF_TRUTH.md`
- `docs/ARCHITECTURE_CURRENT.md`
- `scripts/db_migrate_all.sh`

Do not delete unrelated surrounding content. `scripts/db_migrate_all.sh` was also
normalized from CRLF to LF after Bash rejected mixed line endings.

## New files

New paths are listed in `AGENT_HANDOFF.md` and checksummed in
`CHANGE_MANIFEST.sha256`. They can be moved to an archive directory if the feature is
retired. Preserve `docs/nifty-stratlab` as historical evidence.

## Database

Production `tradingdb` received additive migrations 014–019 and contains governed
research evidence. Do not drop `catalog`, `research`, or `simulation`. To withdraw
the active result, preserve its rows and change/remove only the publication pointer
under an approved transaction. The complete pre-deployment and pre-correction dumps
are under
`/home/novius2/backups/nifty-backtesting/production-before-stratlab-20260802T153627Z`.
The disposable database `tradingdb_nifty_stratlab_test` remains test evidence.
