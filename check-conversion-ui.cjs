const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync('index.html','utf8'),script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const elements=new Map(),cache=new Map(),requests=[];let approve=true,loseResponse=false;let saved={uid:'tester',collection:{0:5},duplicates:{0:4},packs:0,daily:{bestScore:0,newUnique:0,packsOpened:0},stats:{}};
function element(id){if(!elements.has(id))elements.set(id,{setAttribute(){},focus(){},textContent:'',innerHTML:'',style:{},children:[],classList:{toggle(){},add(){},remove(){},contains(){return true}},appendChild(x){this.children.push(x)}});return elements.get(id)}
const ctx={Pi:{init(){}},document:{addEventListener(){},body:{style:{}},documentElement:{},getElementById:element,querySelectorAll(){return[]},createElement(){return {children:[],appendChild(x){this.children.push(x)}}}},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},crypto:{randomUUID:crypto.randomUUID},confirm:text=>{assert.match(text,/4 duplicate copies/);assert.match(text,/4 × Moon Dream/);return approve},navigator:{},location:{},console,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:f=>f(),fetch:async(url,options)=>{
  assert.equal(url,'/api/state');const body=JSON.parse(options.body);requests.push(body);
  let d;
  if(body.action==='conversion_quote')d={target:2,cost:4,consumed:[{index:0,count:4}],quote:'test-quote',player:saved};
  else if(body.action==='conversion_options')d={player:saved,conversion:{available:saved.collection[0]-1,targets:saved.collection[2]?[]:[{index:2,cost:4}]}};
  else if(body.action==='convert_duplicates'){
    if(!saved.collection[2])saved={...saved,collection:{0:1,2:1},duplicates:{0:0},daily:{...saved.daily,newUnique:1}};
    if(loseResponse){loseResponse=false;throw Error('Lost response')}
    d={player:saved,target:2,alreadyConverted:true};
  }else throw Error(body.action);
  return {ok:true,json:async()=>({success:true,storage:true,...d})};
}};
vm.createContext(ctx);vm.runInContext(script+';globalThis.check={set:p=>{player={...player,...p};authData={accessToken:"test"}},load:loadConversionOptions,begin:beginConversion,recover:recoverConversion,pending:pendingConversion,dialogOpen:()=>!!conversionDialogResolver,close:closeConversionDialog};',ctx);
(async()=>{
ctx.check.set(saved);await ctx.check.load();assert.match(element('conversionBalance').textContent,/4/);
approve=false;let operation=ctx.check.begin(2);for(let i=0;i<15&&!ctx.check.dialogOpen();i++)await Promise.resolve();assert(ctx.check.dialogOpen());ctx.check.close(false);await operation;assert(!requests.some(x=>x.action==='convert_duplicates'));assert.equal(ctx.check.pending(),null);
approve=true;loseResponse=true;operation=ctx.check.begin(2);for(let i=0;i<15&&!ctx.check.dialogOpen();i++)await Promise.resolve();assert(ctx.check.dialogOpen());assert.match(element('conversionSources').innerHTML,/Moon Dream/);assert.match(element('conversionCost').textContent,/4/);ctx.check.close(true);await operation;const pending=ctx.check.pending();assert(pending);assert.equal(saved.collection[2],1);
await ctx.check.recover();assert.equal(ctx.check.pending(),null);
const submitted=requests.filter(x=>x.action==='convert_duplicates');assert.equal(submitted.length,2);assert.equal(submitted[0].conversionId,submitted[1].conversionId);assert.match(element('conversionStatus').textContent,/added to your album/);
console.log('UI conversion tests passed: server quote, exact-copy confirmation, cancellation, persisted uncertain request and recovery using the same identifier.');
})().catch(e=>{console.error(e);process.exitCode=1});
