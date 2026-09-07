/** Bounded FIFO admission. Expired queued jobs never start; in-flight work retains its slot. */
export class WorkAdmission {
 private active=0;
 private queue:Array<()=>void>=[];
 constructor(private readonly limit=1,private readonly maxQueued=16,private readonly waitMs=10_000) {
  if(!Number.isInteger(limit)||limit<1||maxQueued<0||waitMs<1)throw new RangeError("Invalid admission limits");
 }
 async run<T>(work:()=>Promise<T>):Promise<T>{
  if(this.active>=this.limit){
   if(this.queue.length>=this.maxQueued)throw Object.assign(new Error("Analysis capacity busy"),{status:503,code:"ANALYSIS_BUSY"});
   await new Promise<void>((resolve,reject)=>{
    const start=()=>{clearTimeout(timer);this.active++;resolve();};
    const timer=setTimeout(()=>{this.queue=this.queue.filter(item=>item!==start);reject(Object.assign(new Error("Analysis queue timeout"),{status:503,code:"ANALYSIS_BUSY"}));},this.waitMs);
    this.queue.push(start);
   });
  }else{this.active++;}
  try{return await work();}finally{this.active--;this.queue.shift()?.();}
 }
}
