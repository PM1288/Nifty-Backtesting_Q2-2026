import { Horizon, instrumentEvidence, number, Observation } from './tradeObservation';
export const chargePolicy = 'ZERODHA_NSE_OPTIONS_CALCULATOR_20260909';
const money=(v:number)=>Number(v.toFixed(2));
/** Two executed premium orders, not expiry/exercise. Rates and rounding match
 * Zerodha brokerage.js cal_options for positive buy/sell, verified 2026-09-09.
 * Zero premium is not treated as a free/absent sell order: retain explicit 2 orders. */
export function optionPnl(entry:unknown,exit:unknown,quantity:unknown) {
 const buy=number(entry),sell=number(exit),qty=number(quantity);
 if(buy===null||sell===null||qty===null||buy<=0||sell<0||!Number.isSafeInteger(qty)||qty<=0)return null;
 const turnover=money((buy+sell)*qty),brokerage=40;
 const stt=Math.round(money(sell*qty*0.0015));
 const sebi=money(turnover*0.000001),exchange=money(turnover*0.0003503),ipft=money(turnover*0.000005);
 const gst=money((brokerage+sebi+exchange+ipft)*0.18),stamp=Math.round(money(buy*qty*0.00003));
 const charges=money(brokerage+stt+sebi+exchange+ipft+gst+stamp),delta=sell-buy,gross=money(delta*qty);
 return {policy:chargePolicy,entry:buy,exit:sell,quantity:qty,delta,gross,brokerage,stt,sebi,exchange,ipft,gst,stamp,charges,net:money(gross-charges)};
}
export function observationOptionPnl(row: Observation, horizon: Horizon, leg: 'ce'|'pe', exit: 'endpoint'|'max'|'min'='endpoint', lots=1) {
 const lotSize=number(row[`${leg}_lot_size`]);
 const quantity=lotSize!==null&&Number.isSafeInteger(lotSize)&&lotSize>0&&Number.isSafeInteger(lots)&&lots>0?lotSize*lots:null;
 const evidence=instrumentEvidence(row,horizon,leg);
 return {lotSize,quantity,evidence,pnl:optionPnl(row[`${leg}_entry_open`],evidence[exit],quantity)};
}
export function scalperLink(row:Observation) {
 if(!['underlying_symbol','ce_symbol','pe_symbol','ce_token','pe_token','expiry','trade_date'].every(k=>typeof row[k]==='string'&&row[k])||number(row.strike)===null)return null;
 const p=new URLSearchParams({view:'scalper',symbol:String(row.underlying_symbol),expiry:String(row.expiry),chartExpiry:String(row.expiry),strike:String(row.strike),day:String(row.trade_date),interval:String(row.interval_minutes),pin:'true',range:'day',expectedCE:String(row.ce_symbol),expectedPE:String(row.pe_symbol),expectedCEToken:String(row.ce_token),expectedPEToken:String(row.pe_token)});
 return `/strategy/trading-analytics?${p}`;
}
