-- Run as a PostgreSQL administrator after replacing role names as needed.
-- Set passwords out-of-band; never commit them.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'paper_trading_app') THEN
        CREATE ROLE paper_trading_app LOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'paper_trading_migrator') THEN
        CREATE ROLE paper_trading_migrator LOGIN;
    END IF;
END
$$;

GRANT CONNECT ON DATABASE tradingdb TO paper_trading_app, paper_trading_migrator;
GRANT USAGE ON SCHEMA public TO paper_trading_app;
GRANT SELECT ON public.bars_1m, public.instruments TO paper_trading_app;

GRANT USAGE ON SCHEMA paper_trading TO paper_trading_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA paper_trading TO paper_trading_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA paper_trading TO paper_trading_app;

GRANT CREATE ON DATABASE tradingdb TO paper_trading_migrator;
GRANT ALL PRIVILEGES ON SCHEMA paper_trading TO paper_trading_migrator;

ALTER DEFAULT PRIVILEGES FOR ROLE paper_trading_migrator IN SCHEMA paper_trading
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO paper_trading_app;
ALTER DEFAULT PRIVILEGES FOR ROLE paper_trading_migrator IN SCHEMA paper_trading
    GRANT USAGE, SELECT ON SEQUENCES TO paper_trading_app;
