const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync('index.html','utf8'),script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],cache=new Map(),els=new Map();
function node(){return {textContent:'',innerHTML:'',style:{},classList:{toggle(){},add(){},remove(){},contains(){return false}},appendChild(){},setAttribute(){},focus(){}}}function el(id){if(!els.has(id))els.set(id,node());return els.get(id)}
let callbacks,created=0,requests=[],lost=true,hold;
const ctx={Pi:{init(){},createPayment:async(data,c)=>{callbacks=c;created++}},document:{addEventListener(){},body:{style:{}},documentElement:{},getElementById:el,querySelectorAll:()=>[],createElement:node},localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},navigator:{},location:{},console,crypto:{randomUUID:crypto.randomUUID},queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:f=>f(),fetch:async(url,o)=>{
 const body=JSON.parse(o.body);requests.push(body);
 if(body.action==='open_pack'){if(hold)await hold;if(lost){lost=false;throw Error('Reply lost')};return{ok:true,json:async()=>({storage:true,player:{uid:'tester',packs:0,activeAlbum:1},reveal:[0,1,2],alreadyOpened:true})}}
 if(body.action==='complete')throw Error('Payment reply lost');
 if(body.action==='recover')return{ok:true,json:async()=>({completed:true,player:{uid:'tester',packs:1,activeAlbum:1}})};
 throw Error('Unexpected action '+body.action);
}};
vm.createContext(ctx);vm.runInContext(script+';globalThis.check={set:p=>{player={...player,...p};authData={accessToken:"test"}},pending:pendingPackRequest,player:()=>player,busy:()=>paymentFlowBusy};',ctx);
(async()=>{
ctx.check.set({uid:'tester',packs:1,activeAlbum:1});let release;hold=new Promise(r=>release=r);const first=ctx.openPack();await ctx.openPack();assert.equal(requests.length,1);release();await first;hold=null;assert(ctx.check.pending());assert.match(el('openPackBtn').textContent,/Recover/);ctx.check.set({packs:0});await ctx.openPack();assert.equal(ctx.check.pending(),null);assert.equal(requests[0].openId,requests[1].openId);assert.equal(requests[0].albumId,requests[1].albumId);
await ctx.buyPack();assert.equal(created,1);await callbacks.onReadyForServerCompletion('test-payment','test-tx');assert.equal(ctx.check.busy(),false);assert.match(el('payBtn').textContent,/Recover/);await ctx.buyPack();assert.equal(created,1);assert.equal(requests.at(-1).action,'recover');assert.equal(requests.at(-1).paymentId,'test-payment');assert.equal(cache.has('sticker-payment:tester'),false);
// Out-of-order load responses do not overwrite the newer server snapshot.
const pending=[];ctx.fetch=()=>new Promise(r=>pending.push(r));const old=ctx.stateApi('load'),fresh=ctx.stateApi('load');pending[1]({ok:true,json:async()=>({storage:true,player:{packs:9}})});await fresh;pending[0]({ok:true,json:async()=>({storage:true,player:{packs:1}})});await old;assert.equal(ctx.check.player().packs,9);
console.log('UI recovery: double tap, lost pack response with same ID/album and zero balance, pending payment recovery without second payment, stale state response passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
