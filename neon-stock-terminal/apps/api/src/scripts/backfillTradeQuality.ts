import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { projectStoredTradeQuality, TRADE_QUALITY_POLICY } from "../lib/tradeQuality";

const prisma = new PrismaClient();
const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);

async function main() {
  const policyJson = json(TRADE_QUALITY_POLICY);
  const policyHash = createHash("sha256").update(policyJson).digest("hex");
  for (const [assetClass, policy] of [["EQUITY", TRADE_QUALITY_POLICY.cash], ["OPTION", TRADE_QUALITY_POLICY.options]] as const) {
    await prisma.$executeRawUnsafe(`
      insert into paper_trading.trade_quality_policies(
        policy_id,policy_version,effective_from,asset_class,process_maximum,outcome_maximum,policy_json,immutable_hash
      ) values ($1,$2,$3::date,$4,$5,$6,$7::jsonb,$8)
      on conflict(policy_id,policy_version,asset_class) do nothing
    `, TRADE_QUALITY_POLICY.policyId, TRADE_QUALITY_POLICY.version, TRADE_QUALITY_POLICY.effectiveFrom, assetClass, policy.processMaximum, policy.outcomeMaximum, policyJson, policyHash);
  }

  const rows = await prisma.$queryRawUnsafe<Record<string, any>[]>(`
    select g.trade_group_id::text,g.asset_class,g.status as group_status,g.performance_basis_amount::text,
           g.metadata,max(l.opened_at) as opened_at,max(l.closed_at) as closed_at,
           max(l.side) as side,max(p.last_mark_at) as last_mark_at,
           max(dc.run_id::text) as evidence_run_id,max(dc.available_at) as evidence_available_at,
           max(dc.data_quality)::text as evidence_data_quality,max(dc.data_permission) as evidence_data_permission,
           max(dc.rsi14)::text as evidence_rsi14,max(dc.willr14)::text as evidence_willr14,
           max(dc.atr14)::text as evidence_atr14,max(dc.volume_vs_sma20)::text as evidence_volume_ratio,
           max(dc.reference_price)::text as evidence_reference_price,max(dc.no_chase_price)::text as evidence_no_chase_price,
           max(dc.component_scores::text)::jsonb as evidence_component_scores,
           max(a.opening_cash)::text as account_opening_cash,max(a.risk_limits::text)::jsonb as account_risk_limits,
           coalesce((select sum(c.amount) from paper_trading.charge_ledger c where c.trade_group_id=g.trade_group_id),0)::text as charges_total,
           coalesce((select sum(f.spread_cost+f.slippage_cost) from paper_trading.paper_fills f join paper_trading.trade_legs fl using(trade_leg_id) where fl.trade_group_id=g.trade_group_id),0)::text as fill_friction_total,
           max(qr.ratings::text)::jsonb as review_ratings,
           max(qr.hard_fail_flags::text)::text[] as review_hard_fail_flags,
           bool_or(coalesce(qr.entry_evidence_confirmed,false)) as review_entry_evidence_confirmed,
           coalesce(sum(p.opened_quantity),0)::text as opened_quantity,
           coalesce(sum(p.remaining_quantity),0)::text as remaining_quantity,
           case when count(*) filter(where p.average_entry_price is not null)=1 then max(p.average_entry_price)::text end as average_entry_price,
           coalesce(sum(p.realised_pnl),0)::text as realised_net_pnl,
           coalesce(sum(p.unrealised_pnl),0)::text as unrealised_pnl,
           case when g.asset_class='EQUITY' then max(o.status) end as observation_status,
           case when g.asset_class='EQUITY' then max(h5.max_high_return)*100 end::text as mfe_5d_pct,
           case when g.asset_class='EQUITY' then min(h5.mae)*100 end::text as mae_5d_pct,
           greatest(coalesce(max(p.last_mark_at),'-infinity'::timestamptz),coalesce(max(h5.completed_at),'-infinity'::timestamptz),g.created_at) as evidence_through
    from paper_trading.trade_groups g
    join paper_trading.accounts a using(account_id)
    left join paper_trading.trade_legs l using(trade_group_id)
    left join paper_trading.instrument_snapshots i using(instrument_snapshot_id)
    left join paper_trading.positions p using(trade_leg_id)
    left join paper_trading.observation_trackers o using(trade_leg_id)
    left join paper_trading.horizon_outcomes h5 on h5.observation_tracker_id=o.observation_tracker_id and h5.horizon_sessions=5
    left join paper_trading.v_trade_quality_review_latest qr
      on qr.trade_group_id=g.trade_group_id and qr.policy_version='${TRADE_QUALITY_POLICY.version}'
    left join lateral (
      select d.* from oiis_live.daily_candidate d
      where upper(d.symbol)=upper(regexp_replace(i.symbol,'-EQ$','','i'))
        and d.available_at <= coalesce(l.opened_at,g.opened_at,g.created_at)
        and d.direction=(case when l.side='SELL' then 'SHORT' else 'LONG' end)
      order by (d.run_id::text=coalesce(g.metadata->>'run_id','')) desc,d.available_at desc,d.created_at desc
      limit 1
    ) dc on true
    group by g.trade_group_id
    having coalesce(sum(p.opened_quantity),0)>0
    order by g.created_at
  `);

  let written = 0;
  for (const row of rows) {
    const result = projectStoredTradeQuality(row);
    const watermark = createHash("sha256").update(json({ row, version: result.policyVersion })).digest("hex");
    const assessment = await prisma.$queryRawUnsafe<Array<{ assessment_id: string }>>(`
      insert into paper_trading.trade_quality_assessments(
        trade_group_id,policy_id,policy_version,asset_class,assessment_stage,status,
        process_points,process_score_pct,process_coverage_pct,outcome_points,outcome_score_pct,outcome_coverage_pct,
        total_score,quality_label,hard_fail_flags,evidence_through,source_watermark,input_snapshot,result_snapshot
      ) values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::text[],$16,$17,$18::jsonb,$19::jsonb)
      on conflict(trade_group_id,policy_version,assessment_stage,source_watermark)
      do update set computed_at=now(),result_snapshot=excluded.result_snapshot
      returning assessment_id::text
    `, row.trade_group_id, result.policyId, result.policyVersion, result.assetClass,
      row.group_status === "CLOSED" ? "FINAL" : "CURRENT", result.status,
      result.process.points, result.process.scorePct, result.process.coveragePct,
      result.outcome.points, result.outcome.scorePct, result.outcome.coveragePct,
      result.totalScore, result.label, result.hardFailFlags, row.evidence_through,
      watermark, json(row), json(result));
    const assessmentId = assessment[0]?.assessment_id;
    if (!assessmentId) continue;
    await prisma.$executeRawUnsafe("delete from paper_trading.trade_quality_criteria where assessment_id=$1::uuid", assessmentId);
    for (const criterion of result.criteria) {
      await prisma.$executeRawUnsafe(`
        insert into paper_trading.trade_quality_criteria(
          assessment_id,criterion_id,phase,weight,rating,weighted_points,status,reason
        ) values($1::uuid,$2,$3,$4,$5,$6,$7,$8)
      `, assessmentId, criterion.id, criterion.phase, criterion.weight, criterion.rating, criterion.points, criterion.status, criterion.reason);
    }
    written += 1;
  }
  process.stdout.write(`${json({ policyVersion: TRADE_QUALITY_POLICY.version, tradesRead: rows.length, assessmentsWritten: written })}\n`);
}

main().finally(() => prisma.$disconnect());
