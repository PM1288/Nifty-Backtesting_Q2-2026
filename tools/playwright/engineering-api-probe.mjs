import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const base=(process.env.PLAYWRIGHT_BASE_URL??'https://n50.nifty50today.co.in/n50').replace(/\/$/,'');
const out=process.env.PLAYWRIGHT_OUTPUT_DIR;
if(!out||!process.env.PLAYWRIGHT_ADMIN_PASSWORD)throw new Error('Protected credentials and output directory required');
await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true});const results=[];
try {
 const context=await browser.newContext();
 const auth=await context.request.post(base+'/auth/session/dev-login',{data:{identifier:'admin',password:process.env.PLAYWRIGHT_ADMIN_PASSWORD}});if(auth.status()!==200)throw new Error('Login failed');
 for(const route of ['/v1/rolling-monthly/absolute-evaluations','/v1/rolling-monthly/absolute-months?includeEvaluations=false&basis=close','/v1/rolling-monthly/absolute-months?basis=close','/v1/overview','/v1/data-health','/api/v1/dashboard/summary']){
  const start=performance.now();try{const res=await context.request.get(base+route,{timeout:60000});const body=await res.body();let obj={};try{obj=JSON.parse(body.toString());}catch{}results.push({route,status:res.status(),ms:Math.round(performance.now()-start),bytes:body.length,evaluations:obj.evaluations?.length,candidates:obj.candidates?.length,error:res.ok()?undefined:obj.error});}catch(e){results.push({route,ms:Math.round(performance.now()-start),error:e.message.split('\n')[0]});}
 }
 await context.close();
}finally{await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));
