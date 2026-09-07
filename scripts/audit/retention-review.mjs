#!/usr/bin/env node
// Read-only catalog/planner audit. No cleanup, VACUUM, ANALYZE or DDL is issued.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
const out=process.env.AUDIT_OUTPUT??'output/retention-review-20260907';
await fs.mkdir(out,{recursive:true});
const container='trading-stack-novius2-postgres-1';
function query(sql){return execFileSync('docker',['exec','-i',container,'sh','-c','PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1500" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -f -'],{input:sql,encoding:'utf8',maxBuffer:32*1024*1024,timeout:25000}).trim();}
function rows(sql){
  // FK rows also reference an index via conindid: never count them as duplicate indexes.
  sql=sql.replace('LEFT JOIN pg_constraint con ON con.conindid=c.oid','LEFT JOIN pg_constraint con ON con.conindid=c.oid AND con.contype IN (\'p\',\'u\',\'x\')');
  return JSON.parse(query(`SELECT coalesce(json_agg(x),'[]') FROM (${sql}) x`));
}
const id=s=>'"'+s.replaceAll('"','""')+'"';
const catalog={capturedAt:new Date().toISOString(),safety:'READ_ONLY catalog and EXPLAIN WITHOUT ANALYZE; estimates not exact purge counts',
databases:rows(`SELECT datname,pg_database_size(oid) bytes FROM pg_database ORDER BY 2 DESC`),
settings:rows(`SELECT name,setting,unit FROM pg_settings WHERE name IN ('server_version','shared_buffers','work_mem','maintenance_work_mem','max_connections','autovacuum','autovacuum_max_workers','autovacuum_vacuum_scale_factor','autovacuum_analyze_scale_factor','max_wal_size','min_wal_size','wal_keep_size','archive_mode','track_io_timing','log_min_duration_statement')`),
stats:rows(`SELECT datname,stats_reset,numbackends,xact_commit,xact_rollback,blks_read,blks_hit,temp_files,temp_bytes,deadlocks FROM pg_stat_database WHERE datname=current_database()`),
tables:rows(`SELECT c.oid,n.nspname schema,c.relname name,c.relkind,c.relispartition, pn.nspname parent_schema,p.relname parent,pg_get_expr(c.relpartbound,c.oid) partition_bound,pg_total_relation_size(c.oid) bytes,pg_table_size(c.oid) table_bytes,pg_indexes_size(c.oid) index_bytes,c.reltuples::bigint estimated_rows,s.n_live_tup,s.n_dead_tup,s.seq_scan,s.idx_scan,s.n_tup_ins,s.n_tup_upd,s.n_tup_del,s.last_autovacuum,s.last_autoanalyze,s.last_vacuum,s.last_analyze FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_inherits inh ON inh.inhrelid=c.oid LEFT JOIN pg_class p ON p.oid=inh.inhparent LEFT JOIN pg_namespace pn ON pn.oid=p.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid WHERE c.relkind IN ('r','p','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY pg_total_relation_size(c.oid) DESC`),
columns:rows(`SELECT table_schema schema,table_name name,column_name column,data_type FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1,2,ordinal_position`),
indexes:rows(`SELECT n.nspname schema,t.relname table_name,c.relname name,pg_relation_size(c.oid) bytes,i.indisprimary,i.indisunique,i.indisvalid,i.indisreplident,con.conname constraint_name,coalesce(s.idx_scan,0) idx_scan,am.amname access_method,i.indkey::text keys,i.indclass::text opclasses,i.indcollation::text collations,i.indoption::text options,i.indnkeyatts,i.indnatts,pg_get_expr(i.indexprs,i.indrelid) expressions,pg_get_expr(i.indpred,i.indrelid) predicate,pg_get_indexdef(c.oid) definition FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_am am ON am.oid=c.relam LEFT JOIN pg_stat_user_indexes s ON s.indexrelid=c.oid LEFT JOIN pg_constraint con ON con.conindid=c.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY pg_relation_size(c.oid) DESC`),
foreignKeys:rows(`SELECT conrelid::regclass::text from_table,confrelid::regclass::text to_table,conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE contype='f'`),
viewDependencies:rows(`SELECT DISTINCT v.oid::regclass::text dependent,d.refobjid::regclass::text source FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid JOIN pg_class v ON v.oid=r.ev_class JOIN pg_namespace n ON n.oid=v.relnamespace WHERE d.refclassid='pg_class'::regclass AND d.refobjid<>v.oid AND n.nspname NOT IN ('pg_catalog','information_schema')`),
activity:rows(`SELECT backend_type,state,wait_event_type,wait_event,count(*) sessions,max(extract(epoch FROM now()-xact_start)) oldest_transaction_seconds FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3,4`),
slots:rows(`SELECT slot_name,slot_type,active,pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn) retained_wal_bytes FROM pg_replication_slots`),
wal:rows(`SELECT sum(size) bytes,count(*) files FROM pg_ls_waldir()`),
extensions:rows(`SELECT extname,extversion FROM pg_extension`),
slowQueries:rows(`SELECT queryid,calls,total_exec_time,mean_exec_time,rows,shared_blks_read,temp_blks_written FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 25`),
dailyCoverage:rows(`SELECT source,exchange,count(*) rows,count(DISTINCT symbol_token) tokens,min(trade_date),max(trade_date) FROM public.bars_1d GROUP BY 1,2`),
oldResearchBounds:rows(`SELECT min(ts),max(ts) FROM research.security_minute_technical`),
idleTransactions:rows(`SELECT pid,application_name,client_addr,state,now()-xact_start duration,backend_xid,backend_xmin FROM pg_stat_activity WHERE state='idle in transaction'`),
};
const physical=catalog.tables.filter(t=>t.relkind!=='p');
const schemaTotals=Object.values(physical.reduce((m,t)=>{const a=m[t.schema]??={schema:t.schema,bytes:0,index_bytes:0,tables:0};a.bytes+=t.bytes;a.index_bytes+=t.index_bytes;a.tables++;return m;},{})).sort((a,b)=>b.bytes-a.bytes);
const groups=new Map();
for(const i of catalog.indexes){const key=JSON.stringify([i.schema,i.table_name,i.access_method,i.keys,i.opclasses,i.collations,i.options,i.indnkeyatts,i.indnatts,i.expressions,i.predicate]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
const duplicateCandidates=[...groups.values()].filter(g=>g.length>1).map(g=>({schema:g[0].schema,table:g[0].table_name,indexes:g.map(i=>({name:i.name,bytes:i.bytes,idx_scan:i.idx_scan,protected:!!(i.indisprimary||i.indisunique||i.constraint_name||i.indisreplident),valid:i.indisvalid})),state:'REVIEW_ONLY_NOT_APPROVED_TO_DROP'}));
const cutoffs=rows(`SELECT now() as_of,((now() AT TIME ZONE 'Asia/Kolkata')::date-15)::timestamp AT TIME ZONE 'Asia/Kolkata' minute_cutoff,((now() AT TIME ZONE 'Asia/Kolkata')::date-30)::timestamp AT TIME ZONE 'Asia/Kolkata' option_cutoff`)[0];
const estimates=[];
for(const t of physical.filter(t=>t.bytes>100*1024*1024)){
  const base=t.parent??t.name;
  let days=null,col=null;
  if(/^(market_ticks|bars_1m|depth_5_metrics|depth_5_snapshots|security_minute_technical|raw_security_1m|raw_index_1m|security_minute_feature|market_minute_feature|stock_minute_volume_profile)$/.test(base))days=15;
  if(/^(quote_snapshots|option_greeks|smartapi_option_chain_snapshots|oi_snapshots_options|oi_snapshots_equity|oi_snapshots_futures|pcr_snapshots|symbol_perf_snapshot|api_request_log)$/.test(base))days=30;
  if(days==null)continue;
  const columns=catalog.columns.filter(c=>c.schema===t.schema&&c.name===t.name);
  col=(base==='market_ticks'?['exchange_ts','received_at']:['trade_date','ts','minute_ts','created_at','as_of']).find(k=>columns.some(c=>c.column===k));
  if(!col)continue;
  const cutoff=days===15?cutoffs.minute_cutoff:cutoffs.option_cutoff;
  try{const plan=JSON.parse(query(`EXPLAIN (FORMAT JSON) SELECT 1 FROM ${id(t.schema)}.${id(t.name)} WHERE ${id(col)} < '${cutoff}'::timestamptz`))[0].Plan;
  const fraction=t.estimated_rows>0?Math.min(1,plan['Plan Rows']/t.estimated_rows):null;
  const bound=t.partition_bound?.match(/TO \('([^']+)'\)/)?.[1];
  const wholePartition=!!bound&&Date.parse(bound)<=Date.parse(cutoff);
  estimates.push({schema:t.schema,table:t.name,parent:t.parent,days,column:col,cutoff,bytes:t.bytes,index_bytes:t.index_bytes,estimated_rows:t.estimated_rows,estimated_expired_rows:plan['Plan Rows'],estimated_expired_fraction:fraction,estimated_expired_bytes:fraction==null?null:Math.round(t.bytes*fraction),whole_partition_before_cutoff:wholePartition,whole_partition_bytes:wholePartition?t.bytes:0,plan_node:plan['Node Type'],state:'DEPENDENCY_AND_DAILY_COVERAGE_GATES_REQUIRED'});
  }catch{estimates.push({schema:t.schema,table:t.name,state:'PLANNER_CHECK_FAILED_NO_ESTIMATE'});}
}
const csv=rows=>{const keys=[...new Set(rows.flatMap(Object.keys))];const esc=v=>'"'+String(v==null?'':typeof v==='object'?JSON.stringify(v):v).replaceAll('"','""')+'"';return [keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');};
await fs.writeFile(`${out}/catalog.json`,JSON.stringify({...catalog,cutoffs},null,2));
for(const [name,data] of Object.entries({relations:catalog.tables,schema_totals:schemaTotals,indexes:catalog.indexes,duplicate_index_candidates:duplicateCandidates,retention_estimates:estimates,foreign_keys:catalog.foreignKeys,view_dependencies:catalog.viewDependencies}))await fs.writeFile(`${out}/${name}.csv`,csv(data));
await fs.writeFile(`${out}/estimates.json`,JSON.stringify({cutoffs,estimates,duplicateCandidates,schemaTotals},null,2));
const containers=JSON.parse(execFileSync('docker',['inspect',...execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n').filter(n=>n.startsWith('trading-stack-novius2-')||n==='nse_ingestor')],{encoding:'utf8',maxBuffer:16*1024*1024}));
const runtime=containers.map(d=>({name:d.Name,image:d.Image,status:d.State.Status,health:d.State.Health?.Status??null,memoryLimit:d.HostConfig.Memory,cpuNano:d.HostConfig.NanoCpus,ips:Object.values(d.NetworkSettings.Networks).map(n=>n.IPAddress),retentionEnv:d.Config.Env.filter(v=>/^(RAW_RETENTION_DAYS|MINUTE_RETENTION_DAYS|FEATURE_RETENTION_DAYS|SNAPSHOT_RETENTION_DAYS|OPS_RUN_RETENTION_DAYS|CRON_RETENTION)=/.test(v)),logging:d.HostConfig.LogConfig}));
const config=execFileSync('docker',['exec','trading-stack-novius2-collector-1','cat','/app/config.yaml'],{encoding:'utf8'}).replaceAll('\r','');
const retention=config.match(/^retention:\n(?:[ \t].*\n)*/m)?.[0]??'NOT_FOUND';
const logs=execFileSync('docker',['logs','--since','24h','--tail','8000','trading-stack-novius2-collector-1'],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
const selectedLogs=logs.split('\n').filter(l=>/retention_cleanup_(done|failed)/.test(l)).map(l=>l.replace(/postgres(?:ql)?:\/\/[^\s"]+/gi,'[redacted-dsn]'));
await fs.writeFile(`${out}/runtime.json`,JSON.stringify({capturedAt:new Date().toISOString(),containers:runtime,collectorRetention:retention,retentionLogTail:selectedLogs.slice(-20),retentionLogSampleCounts:{done:selectedLogs.filter(l=>l.includes('retention_cleanup_done')).length,failed:selectedLogs.filter(l=>l.includes('retention_cleanup_failed')).length},dockerDisk:execFileSync('docker',['system','df'],{encoding:'utf8',timeout:30000}),filesystem:execFileSync('df',['-h','.'],{encoding:'utf8'})},null,2));
console.log(JSON.stringify({out,databases:catalog.databases,physicalRelations:physical.length,estimatedBytes:estimates.reduce((s,r)=>s+(r.estimated_expired_bytes??0),0),wholePartitionBytes:estimates.reduce((s,r)=>s+(r.whole_partition_bytes??0),0),duplicateGroups:duplicateCandidates.length}));
