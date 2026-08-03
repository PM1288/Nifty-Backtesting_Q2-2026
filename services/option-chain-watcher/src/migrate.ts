import { Pool } from 'pg';

export async function migrate(pool: Pool): Promise<void> {
  const statements: string[] = [
    `
    create table if not exists option_chain_snapshots (
      id bigserial primary key,
      captured_at timestamptz not null default now(),
      symbol text not null,
      expiry_date date not null,
      underlying_value numeric(12,2),
      atm_strike numeric(12,2),
      strikes_around int not null default 6,
      source text not null default 'nseindia',
      fetch_ms int,
      raw jsonb
    );
    `,
    `
    create index if not exists idx_option_chain_snapshots_symbol_time
      on option_chain_snapshots (symbol, captured_at desc);
    `,
    `
    create index if not exists idx_option_chain_snapshots_expiry
      on option_chain_snapshots (symbol, expiry_date);
    `,
    `
    create index if not exists idx_option_chain_snapshots_symbol_expiry_time
      on option_chain_snapshots (symbol, expiry_date, captured_at desc);
    `,
    `
    create table if not exists option_chain_legs (
      id bigserial primary key,
      snapshot_id bigint not null references option_chain_snapshots(id) on delete cascade,
      strike numeric(12,2) not null,
      option_type char(2) not null check (option_type in ('CE','PE')),
      last_price numeric(12,2),
      change numeric(12,2),
      implied_volatility numeric(10,4),
      total_traded_volume bigint,
      open_interest bigint,
      change_in_oi bigint,
      bid_qty bigint,
      bid_price numeric(12,2),
      ask_qty bigint,
      ask_price numeric(12,2),
      instrument_identifier text
    );
    `,
    `
    alter table option_chain_legs
      add column if not exists delta numeric(18,8),
      add column if not exists gamma numeric(18,8),
      add column if not exists theta numeric(18,8),
      add column if not exists vega numeric(18,8);
    `,
    `
    create unique index if not exists uq_option_chain_legs_snapshot_strike_type
      on option_chain_legs(snapshot_id, strike, option_type);
    `,
    `
    create index if not exists idx_option_chain_legs_strike_type
      on option_chain_legs (strike, option_type);
    `,
    `
    create table if not exists option_chain_housekeeping (
      id boolean primary key default true,
      last_cleanup_at timestamptz
    );
    `,
    `
    insert into option_chain_housekeeping (id, last_cleanup_at)
    values (true, '1970-01-01')
    on conflict (id) do nothing;
    `,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
}
