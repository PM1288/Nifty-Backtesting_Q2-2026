# Repository map for agents

- The deployed Compose stack is `/home/novius2/trading-stack`; this repository is its versioned source mirror.
- Universal paper trading lives in `services/paper_trading`; deploy it with `compose/compose.paper-trading.yml` alongside the base stack.
- PostgreSQL market input is read from `public.bars_1m` and `public.instruments`. Paper records live only in `paper_trading`.
- Never commit `.env`, credentials, service tokens, webhook passwords, or database DSNs.
- Run the paper-service checks from its folder: `./scripts/test.sh`.
- Record material operational work in the root `AGENT_HANDOFF.md`.
