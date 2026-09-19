import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTradingShortlist, parsePersonalPicks, shortlistKey} from '../src/features/today/tradingShortlist';
import type {ProgressionMatrixRow} from '../src/features/today/scalperProgressionMatrix';
const day = '2026-09-19';
const ranks = [
  {stock:{symbol:'AAA'}, allGreen:true, bearAllRed:false, rank:1, bearRank:2},
  {stock:{symbol:'BBB'}, allGreen:false, bearAllRed:true, rank:2, bearRank:1},
] as ProgressionMatrixRow[];
test('strategy selections require current session and true selected flag, not recommendation', () => {
  const oiis = {environment:'PAPER' as const, tradeDate:day, runId:'run',count:4,candidates:[
    {symbol:'AAA',direction:'LONG',selected:true,trade_date:day},
    {symbol:'CCC',direction:'LONG',recommended:true,selected:false,trade_date:day},
    {symbol:'OLD',direction:'SHORT',selected:true,trade_date:'2026-09-18'},
    {symbol:'UNKNOWN',direction:'NEUTRAL',selected:true,trade_date:day},
  ]};
  const result = buildTradingShortlist(day,day,ranks,oiis,[{symbol:'AAA',side:'LONG'}]);
  assert.equal(result.length,2);
  assert.deepEqual(result.find(r=>r.symbol==='AAA')?.sources,['MWHD-BULL · all gates','OIIS · selected','Personal']);
  assert.equal(result.find(r=>r.symbol==='BBB')?.side,'SHORT');
  assert.deepEqual(buildTradingShortlist('2026-09-20',day,ranks,oiis,[]),[]);
});
test('personal directions are separate and storage is scoped per account', () => {
  assert.notEqual(shortlistKey('one'),shortlistKey('two'));
  assert.deepEqual(parsePersonalPicks('bad JSON'),[]);
  assert.deepEqual(parsePersonalPicks(JSON.stringify([{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'SHORT'},{symbol:'BAD!',side:'LONG'},{symbol:'BBB',side:'CALL'}])),[{symbol:'AAA',side:'LONG'},{symbol:'AAA',side:'SHORT'}]);
  assert.equal(buildTradingShortlist(day,undefined,[],undefined,[{symbol:'AAA',side:'SHORT'}])[0].sources[0],'Personal');
});
