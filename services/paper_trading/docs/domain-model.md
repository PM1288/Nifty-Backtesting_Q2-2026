# Domain model

A trade intent creates one trade group. Equity groups have one leg; option groups may have many. Orders create fills, fills create positions and close fills append P&L, charge and tax ledgers. Target tracks are hypothetical alternatives and are never summed as portfolio P&L. Observation trackers continue after execution closure until the configured 5/30-session evidence is complete or censored.

Amounts, prices, quantities and rates use PostgreSQL `NUMERIC` and Python `Decimal`. Timestamps are UTC `TIMESTAMPTZ`; exchange sessions are interpreted in `Asia/Kolkata`.
