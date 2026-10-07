const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('admin.html','utf8'),script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],elements=new Map();
function node(){return{attributes:{},setAttribute(k,v){this.attributes[k]=v},textContent:'',value:'30',children:[],classList:{add(){},remove(){}},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}}}
function el(id){if(!elements.has(id))elements.set(id,node());return elements.get(id)}
let rows=[],pending=[];
const ctx={Pi:{init(){}},document:{getElementById:el,createElement:node},console,fetch:async()=>({ok:true,json:async()=>({rows,generatedAt:new Date().toISOString()})})};
vm.createContext(ctx);vm.runInContext(script,ctx);
(async()=>{
rows=[{day:new Date().toISOString().slice(0,10),uniqueUsers:2,events:{run_started:4,run_completed:3,paid_pack_purchased:2,duplicates_converted:1,album_completed:1,xp_pack_earned:2,player_first_run:4,player_repeat_run:2}},{day:'2026-10-06',uniqueUsers:2,events:{run_started:2,run_completed:2,paid_pack_purchased:1,duplicates_converted:2}}];
await ctx.load();assert.equal(el('xpPacks').textContent,2);assert.equal(el('repeatRate').textContent,'50.0%');assert.equal(el('unique').textContent,4);assert.equal(el('today').textContent,2);assert.equal(el('volume').textContent,'0.03');assert.equal(el('conversions').textContent,3);assert.equal(el('albums').textContent,1);assert.equal(el('runRatio').textContent,'83.3%');assert.equal(el('runsPerDay').textContent,'1.25');assert.equal(el('rows').children.length,2);assert.equal(el('rows').children[0].children.length,13);
assert.equal(el('rows').children[0].children[12].attributes['data-label'],'Players with 2+ runs');
assert(html.includes('table{display:block;min-width:0'));
rows=[{day:'<img onerror=alert(1)>',uniqueUsers:NaN,events:{paid_pack_purchased:'bad'}}];await ctx.load();assert.equal(el('volume').textContent,'0.00');assert.equal(el('runRatio').textContent,'—');assert.equal(el('rows').children[0].children[0].textContent,'<img onerror=alert(1)>');
rows=[];await ctx.load();assert.equal(el('conversions').textContent,0);assert.equal(el('rows').children.length,0);
ctx.fetch=()=>new Promise(resolve=>pending.push(resolve));
const first=ctx.load(),second=ctx.load();
pending[1]({ok:true,json:async()=>({rows:[{day:'new',events:{duplicates_converted:7}}],generatedAt:new Date().toISOString()})});await second;
pending[0]({ok:true,json:async()=>({rows:[{day:'old',events:{duplicates_converted:1}}],generatedAt:new Date().toISOString()})});await first;
assert.equal(el('conversions').textContent,7);
console.log('Admin tests passed: aggregate counts, gross Pi volume, zero/missing values, safe table rendering, latest-period response.');
})().catch(e=>{console.error(e);process.exitCode=1});
