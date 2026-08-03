from __future__ import annotations

import argparse
from pathlib import Path

import psycopg


def main() -> int:
    parser = argparse.ArgumentParser(description="Install SQL objects for NSE reco overlay")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--sql-dir", default=str(Path(__file__).resolve().parent.parent / "sql"))
    args = parser.parse_args()

    sql_dir = Path(args.sql_dir)
    if not sql_dir.exists():
        raise SystemExit(f"SQL dir not found: {sql_dir}")

    files = sorted(
        sql_dir.glob("*.sql"),
        key=lambda path: (
            {"070": 70, "071": 71, "072": 72, "073": 73, "074": 74, "075": 75, "076": 76, "077": 77}.get(path.stem.split("_", 1)[0], 999),
            path.name,
        ),
    )
    if not files:
        raise SystemExit(f"No .sql files found in {sql_dir}")

    database_url = args.database_url.replace("postgresql+psycopg://", "postgresql://", 1)

    with psycopg.connect(database_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            for f in files:
                sql = f.read_text(encoding="utf-8")
                cur.execute(sql)
                print(f"applied {f.name}")
        conn.commit()

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
