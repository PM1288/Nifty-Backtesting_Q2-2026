import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTradingShortlist, parsePersonalPicks, shortlistKey} from '../src/features/today/tradingShortlist';
import type {ProgressionMatrixRow} from '../src/features/today/scalperProgressionMatrix';
const day = '2026-09-19';
const source = {currentHourStartedAt:day+'T05:00:00Z',current15mStartedAt:day+'T05:15:00Z',current5mStartedAt:day+'T05:20:00Z'};
const ranks = [
  {stock:{symbol:'AAA'}, source, allGreen:true, bearAllRed:false, rank:1, bearRank:2},
  {stock:{symbol:'BBB'}, source, allGreen:false, bearAllRed:true, rank:2, bearRank:1},
] as ProgressionMatrixRow[];
test('strategy selections require current session and true selected flag, not recommendation', () => {
  const oiis = {environment:'PAPER' as const, tradeDate:day, runId:'run',count:4,candidates:[
    {symbol:'AAA',direction:'LONG',selected:true,trade_date:day},
    {symbol:'CCC',direction:'LONG',recommended:true,selected:false,trade_date:day},
    {symbol:'OLD',direction:'SHORT',selected:true,trade_date:'2026-09-18'},
    {symbol:'UNKNOWN',direction:'NEUTRAL',selected:true,trade_date:day},
  ]};
  const threeMonth = {sessionDate:day,rows:[
    {symbol:'AAA',sessionDate:day,qualification:'QUALIFIED'},
    {symbol:'DDD',sessionDate:day,qualification:'QUALIFIED'},
    {symbol:'REJECTED',sessionDate:day,qualification:'REJECTED'},
  ]} as never;
  const result = buildTradingShortlist(day,day,ranks,oiis,[{symbol:'AAA',side:'LONG'}],threeMonth);
  assert.equal(result.length,3);
  assert.deepEqual(result.find(r=>r.symbol==='AAA')?.sources,['MWHD-BULL · all gates','OIIS · selected','3Month BULL · qualified','Manual']);
  assert.deepEqual(result.find(r=>r.symbol==='AAA')?.sourceIds,['MWHD','OIIS','THREE_MONTH','MANUAL']);
  assert.equal(result[0].symbol,'AAA');
  assert.equal(result[0].agreementCount,4);
  assert.equal(result.find(r=>r.symbol==='DDD')?.side,'LONG');
  assert.equal(result.find(r=>r.symbol==='BBB')?.side,'SHORT');
  assert.deepEqual(buildTradingShortlist('2026-09-20',day,ranks,oiis,[]),[]);
  assert.deepEqual(buildTradingShortlist('2026-09-20','2026-09-20',ranks,undefined,[]),[]);
});
test('personal directions are separate and storage is scoped per account', () => {
  assert.notEqual(shortlistKey('one'),shortlistKey('two'));
  assert.deepEqual(parsePersonalPicks('bad JSON'),[]);
  assert.deepEqual(parsePersonalPicks(JSON.stringify([{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'SHORT'},{symbol:'BAD!',side:'LONG'},{symbol:'BBB',side:'CALL'}])),[{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'SHORT'}]);
  assert.equal(buildTradingShortlist(day,undefined,[],undefined,[{symbol:'AAA',side:'SHORT'}])[0].sources[0],'Manual');
});

test('3Month bull and bear selections are accepted only for the current session and qualified rows', () => {
  const current = {sessionDate:day,rows:[{symbol:'AAA',sessionDate:day,qualification:'QUALIFIED'}]} as never;
  const directional = {sessionDate:day,rows:[{symbol:'BBB',sessionDate:day,qualification:'REJECTED',bull:{qualification:'REJECTED'},bear:{qualification:'QUALIFIED'}}]} as never;
  const stale = {sessionDate:'2026-09-18',rows:[{symbol:'AAA',sessionDate:'2026-09-18',qualification:'QUALIFIED'}]} as never;
  assert.equal(buildTradingShortlist(day,undefined,[],undefined,[],current)[0].sources[0],'3Month BULL · qualified');
  assert.equal(buildTradingShortlist(day,undefined,[],undefined,[],directional)[0].side,'SHORT');
  assert.deepEqual(buildTradingShortlist(day,undefined,[],undefined,[],stale),[]);
});
