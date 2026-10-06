import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const source=(await readFile(new URL('./api/a2u.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
const make=new Function('PiBackend','createHash','randomUUID','verifyPiUser','apiError','fetch','process',source+';return handler;');
const data=new Map(),payments=new Map();let creates=0,submits=0,user={uid:'u1',username:'Giulex84'},verify=true,loseCreate=false,hideTx=false,loseComplete=false;
const prefix='sticker:a2u:testnet';
function set(k){if(!data.has(k))data.set(k,new Set());return data.get(k);}
async function fetch(_url,opts){
 if(_url.includes("incomplete_server_payments"))return {ok:true,json:async()=>({incomplete_server_payments:[...payments.values()].filter(p=>!p.status?.developer_completed&&!p.status?.cancelled)})};
 const [op,...a]=JSON.parse(opts.body);let result;
 if(op==='GET')result=data.get(a[0])??null;
 else if(op==='SET'){if(a.includes('NX')&&data.has(a[0]))result=null;else{data.set(a[0],a[1]);result='OK';}}
 else if(op==='SCARD')result=set(a[0]).size;
 else if(op==='SMEMBERS')result=[...set(a[0])];
 else if(op==='SISMEMBER')result=set(a[0]).has(a[1])?1:0;
 else if(op==='EVAL'){
  const [script,n,...rest]=a,keys=rest.slice(0,Number(n)),args=rest.slice(Number(n));
  if(Number(n)===3){keys.forEach((k,i)=>set(k).add(args[i]));result=1;}
  else if(data.get(keys[0])===args[0]){if(script.includes("'DEL'"))data.delete(keys[0]);result=1;}else result=0;
 }else throw new Error(op);
 return {ok:true,json:async()=>({result})};
}
class Pi{
 async createPayment(p){creates++;const id='p'+creates;payments.set(id,{identifier:id,user_uid:p.uid,direction:'app_to_user',network:'Pi Testnet',amount:.01,to_address:'G'+(p.uid==='duplicate'?'B':String.fromCharCode(65+Number(p.uid.slice(1)))).repeat(55),memo:'Sticker.pi Testnet pioneer reward',metadata:{purpose:'mainnet_readiness_a2u'},status:{}});if(loseCreate){loseCreate=false;throw new Error("ongoing_payment_found");}return id;}
 async cancelPayment(id){payments.get(id).status={cancelled:true};}
 async getPayment(id){const p=structuredClone(payments.get(id));if(hideTx)delete p.transaction;return p;}
 async submitPayment(id){submits++;payments.get(id).transaction={txid:'tx'+id};if(hideTx)throw new Error('timeout after submit');return 'tx'+id;}
 async completePayment(id){payments.get(id).status={developer_completed:true,transaction_verified:verify};if(loseComplete){loseComplete=false;throw new Error("completion response lost");}}
}
const handler=make(Pi,createHash,randomUUID,async()=>user,(res,e)=>res.status(e.status||500).json({error:e.message}),fetch,{env:{PI_API_KEY:'test',PI_WALLET_PRIVATE_SEED:'test',UPSTASH_REDIS_REST_URL:'mock',UPSTASH_REDIS_REST_TOKEN:'test'}});
async function call(action){const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',body:{action}},res);return res;}
let r=await call('status');assert.equal(r.body.completed,0);assert.equal(creates,0);assert.equal(submits,0);
r=await call('claim');assert.equal(r.body.completed,1);assert.equal(r.body.verifiedPayments,1);assert.equal(submits,1);
r=await call('claim');assert.equal(r.body.alreadyClaimed,true);assert.equal(submits,1);
user={uid:'duplicate',username:'Other'};r=await call('claim');assert.equal(r.code,409);assert.equal(submits,1);
user={uid:'u2',username:'Other'};verify=false;r=await call('claim');assert.equal(r.code,409);assert.equal(set(prefix+':wallets').size,1);
verify=true;payments.get('p3').status.transaction_verified=true;r=await call('claim');assert.equal(r.body.completed,2);assert.equal(submits,2);
for(let i=3;i<=5;i++){user={uid:'u'+i,username:'Other'};r=await call('claim');assert.equal(r.body.completed,i);}
assert.equal(r.body.thresholdReached,true);assert.equal(r.body.remaining,0);
user={uid:'u6',username:'Other'};const before=creates;r=await call('claim');assert.equal(r.code,409);assert.equal(creates,before);
user={uid:'u1',username:'Giulex84'};r=await call('status');assert.equal(r.body.admin,true);assert.equal(r.body.verifiedPayments,5);
// Rebuild metrics from legacy completed claims; never submit another transaction.
data.delete(prefix+':wallets');data.delete(prefix+':payments');
for(const uid of set(prefix+':recipients')){const k=prefix+':claim:'+uid;const c=JSON.parse(data.get(k));delete c.walletHash;data.set(k,JSON.stringify(c));}
const sent=submits;r=await call('status');assert.equal(r.body.completed,5);assert.equal(r.body.verifiedPayments,5);assert.equal(submits,sent);
console.log('PASS: status without payment, replay, duplicate wallet, pending recovery, threshold, legacy reconciliation');

// Lost creation response is adopted from Pi, not recreated.
data.clear();payments.clear();user={uid:'u1',username:'Giulex84'};loseCreate=true;const oldCreates=creates;r=await call('claim');assert.equal(r.code,200);assert.equal(creates,oldCreates+1);
// Uncertain submission never transfers twice, even if Pi has not linked its txid yet.
user={uid:'u2',username:'Other'};hideTx=true;const oldSubmits=submits;r=await call('claim');assert.equal(r.body.pending,true);assert.equal(submits,oldSubmits+1);r=await call('claim');assert.equal(r.body.pending,true);assert.equal(submits,oldSubmits+1);hideTx=false;r=await call('claim');assert.equal(r.code,200);assert.equal(submits,oldSubmits+1);
// Completion timeout after success is reconciled.
user={uid:'u3',username:'Other'};loseComplete=true;r=await call('claim');assert.equal(r.code,200);
// A live lock rejects concurrent work before any external side effect.
data.set(prefix+':lock','other-worker');user={uid:'u4',username:'Other'};const previousCreates=creates;r=await call('claim');assert.equal(r.code,409);assert.equal(creates,previousCreates);data.delete(prefix+':lock');
// Creating-only state can safely retry after Pi confirms no ongoing payment.
data.set(prefix+':claim:u4',JSON.stringify({status:'creating',uid:'u4'}));r=await call('claim');assert.equal(r.code,200);assert.equal(creates,previousCreates+1);
console.log('PASS: lost creation response, ongoing recovery, uncertain submission, completion timeout, concurrency, unknown outcome');