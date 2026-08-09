\set ON_ERROR_STOP on

-- Rebind dependent views to the new parent relations after each table swap.
CREATE TEMP TABLE _monthly_partition_view_defs AS
SELECT schemaname, viewname, definition
FROM pg_views
WHERE definition ILIKE ANY (ARRAY[
  '%bars_1m%', '%quote_snapshots%', '%option_greeks%',
  '%oi_snapshots_equity%', '%oi_snapshots_index%',
  '%oi_snapshots_futures%', '%oi_snapshots_options%'
]);

CREATE OR REPLACE FUNCTION pg_temp.migrate_monthly_table(target_table text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  target_schema text := 'public';
  new_table text := target_table || '_partitioned_new';
  legacy_table text := target_table || '_legacy_20260808';
  min_month timestamptz;
  max_month timestamptz;
  cursor_month timestamptz;
  next_month timestamptz;
  partition_name text;
  already_partitioned boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_partitioned_table p
    JOIN pg_class c ON c.oid=p.partrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=target_schema AND c.relname=target_table
  ) INTO already_partitioned;
  IF already_partitioned THEN
    RAISE NOTICE '% already partitioned; skipping', target_table;
    RETURN;
  END IF;
  IF to_regclass(format('%I.%I', target_schema, legacy_table)) IS NOT NULL THEN
    RAISE EXCEPTION 'legacy table % already exists; manual review required', legacy_table;
  END IF;

  EXECUTE format('SELECT date_trunc(''month'',min(ts)), date_trunc(''month'',max(ts)) FROM %I.%I', target_schema, target_table)
    INTO min_month,max_month;
  min_month := COALESCE(min_month,date_trunc('month',now()));
  max_month := GREATEST(COALESCE(max_month,min_month),date_trunc('month',now()) + interval '2 months');

  EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL) PARTITION BY RANGE (ts)', target_schema,new_table,target_schema,target_table);
  cursor_month := min_month;
  WHILE cursor_month <= max_month LOOP
    next_month := cursor_month + interval '1 month';
    partition_name := format('%s_%s',target_table,to_char(cursor_month,'YYYY_MM'));
    EXECUTE format('CREATE TABLE %I.%I PARTITION OF %I.%I FOR VALUES FROM (%L) TO (%L)',target_schema,partition_name,target_schema,new_table,cursor_month,next_month);
    cursor_month := next_month;
  END LOOP;

  EXECUTE format('INSERT INTO %I.%I SELECT * FROM %I.%I',target_schema,new_table,target_schema,target_table);
  EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',target_schema,target_table);
  EXECUTE format('ALTER TABLE %I.%I RENAME TO %I',target_schema,target_table,legacy_table);
  EXECUTE format('ALTER TABLE %I.%I RENAME TO %I',target_schema,new_table,target_table);
  EXECUTE format('ANALYZE %I.%I',target_schema,target_table);
  RAISE NOTICE 'migrated % to readable monthly partitions; recovery copy=%',target_table,legacy_table;
END $$;

SELECT pg_temp.migrate_monthly_table('bars_1m');
SELECT pg_temp.migrate_monthly_table('quote_snapshots');
SELECT pg_temp.migrate_monthly_table('option_greeks');
SELECT pg_temp.migrate_monthly_table('oi_snapshots_equity');
SELECT pg_temp.migrate_monthly_table('oi_snapshots_index');
SELECT pg_temp.migrate_monthly_table('oi_snapshots_futures');
SELECT pg_temp.migrate_monthly_table('oi_snapshots_options');

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _monthly_partition_view_defs LOOP
    EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s',r.schemaname,r.viewname,r.definition);
  END LOOP;
END $$;

-- Rename already-partitioned legacy children to the same readable convention.
DO $$
DECLARE r record; new_name text;
BEGIN
  FOR r IN
    SELECT child.relname old_name,
           regexp_replace(child.relname,'_y([0-9]{4})m([0-9]{2})$','_\1_\2') new_name
    FROM pg_inherits
    JOIN pg_class parent ON parent.oid=inhparent
    JOIN pg_class child ON child.oid=inhrelid
    JOIN pg_namespace n ON n.oid=parent.relnamespace
    WHERE n.nspname='public' AND child.relname ~ '_y[0-9]{4}m[0-9]{2}$'
  LOOP
    IF r.old_name <> r.new_name THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I',r.old_name,r.new_name);
    END IF;
  END LOOP;
END $$;

-- Keep recoverable originals out of the public operational table list.
CREATE SCHEMA IF NOT EXISTS migration_backup_20260808;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bars_1m','quote_snapshots','option_greeks','oi_snapshots_equity',
    'oi_snapshots_index','oi_snapshots_futures','oi_snapshots_options'
  ] LOOP
    IF to_regclass(format('public.%I',table_name || '_legacy_20260808')) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA migration_backup_20260808',table_name || '_legacy_20260808');
    END IF;
  END LOOP;
END $$;

DROP FUNCTION pg_temp.migrate_monthly_table(text);
