begin;
create table if not exists public.instrument_profiles (
  symbol text primary key,
  company_name text not null,
  isin text,
  sector text not null,
  market_cap_bucket text not null check (market_cap_bucket in ('Large Cap','Mid Cap','Small Cap')),
  is_nifty_50 boolean not null default false,
  is_nifty_100 boolean not null default false,
  is_nifty_200 boolean not null default false,
  is_nifty_largemidcap_250 boolean not null default false,
  is_nifty_500 boolean not null default false,
  is_nse_fno boolean not null default false,
  memberships jsonb not null default '[]'::jsonb,
  logo_svg text not null,
  logo_sha256 text not null,
  source_as_of date not null,
  source_name text not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_instrument_profiles_classification on public.instrument_profiles(is_nse_fno,is_nifty_50,is_nifty_largemidcap_250,market_cap_bucket,sector);
comment on table public.instrument_profiles is 'Versioned display/classification metadata and SVG logo assets; never used as trading permission.';
commit;
