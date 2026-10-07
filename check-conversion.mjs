import assert from 'node:assert/strict';
process.env.UPSTASH_REDIS_REST_URL='https://mock.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='test-only';
const db=new Map();let loseResponse=false,conflict=false;
globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://mock.invalid');
  const a=JSON.parse(options.body);let result;
  if(a[0]==='GET')result=db.get(a[1])??null;
  else if(a[0]==='SET'){
    if(a.includes('NX')&&db.has(a[1]))result=null;
    else{db.set(a[1],a[2]);result='OK'}
  }else if(a[0]==='EVAL'&&a[2]==='1'){
    result=db.get(a[3])===a[4]?Number(db.delete(a[3])):0;
   }else if(a[0]==='EVAL'&&a[2]==='2'){
    const next=JSON.parse(a[5]),old=db.has(a[3])?JSON.parse(db.get(a[3])):null;
    const best=!old||next.score>old.score||(next.score===old.score&&next.accuracy>old.accuracy)||(next.score===old.score&&next.accuracy===old.accuracy&&next.bestCombo>old.bestCombo)?next:old;
    result=JSON.stringify(best);db.set(a[3],result);
  }else if(a[0]==='EVAL'&&a[2]==='3'){
    const [,script,,k1,k2,k3,v1,v2,v3,v4]=a;
    if(script.includes('PFADD'))result=1;
    else if(script.includes('local old=')){
      if(conflict){db.set(k1,JSON.stringify({...JSON.parse(db.get(k1)),xp:999}));conflict=false}
      result=(db.get(k1)||'')===v1&&!db.has(k2)&&db.get(k3)===v4?1:0;
      if(result){db.set(k1,v2);db.set(k2,v3)}
      if(loseResponse){loseResponse=false;throw new Error('Response lost after commit')}
    }else{
      result=(db.get(k1)||'')===v1&&db.get(k2)===v3&&(!v4||!db.has(k3))?1:0;
      if(result){db.set(k1,v2);if(v4)db.set(k3,v4)}
    }
  }else if(['INCR','EXPIRE','ZADD'].includes(a[0])){result=a[0]==='INCR'?(Number(db.get(a[1])||0)+1):1;if(a[0]==='INCR')db.set(a[1],result)}else throw new Error('Unsupported test Redis command '+a[0]);
  return {ok:true,json:async()=>({result})};
};
const {defaultPlayer,savePlayer,getPlayer,quoteDuplicateConversion,convertDuplicates,conversionCatalog,grantPaidPack,openPlayerPack,recordRun,serverDay}=await import('./lib/store.js');
const uid='tester',name='Tester';
async function seed(collection){db.clear();const p=defaultPlayer(uid,name);p.collection=collection;p.duplicates=Object.fromEntries(Object.entries(collection).map(([i,n])=>[i,Math.max(0,n-1)]));await savePlayer(p);return p}
const request=(plan,id='conversion_test_0001')=>({target:plan.target,quote:plan.quote,conversionId:id});
let p=await seed({0:5,1:4});
let plan=quoteDuplicateConversion(p,2);assert.equal(plan.cost,4);assert.deepEqual(plan.consumed,[{index:0,count:4}]);
let d=await convertDuplicates(uid,name,request(plan));assert.equal(d.player.collection[0],1);assert.equal(d.player.collection[1],4);assert.equal(d.player.collection[2],1);assert.equal(d.player.daily.newUnique,1);
d=await convertDuplicates(uid,name,request(plan));assert.equal(d.alreadyConverted,true);assert.equal(d.player.daily.newUnique,1);
await assert.rejects(()=>convertDuplicates(uid,name,{...request(plan),target:3}),/another sticker/);
assert.throws(()=>quoteDuplicateConversion(d.player,0),/already own/);
assert.throws(()=>quoteDuplicateConversion(d.player,23),/Not enough/);
assert.throws(()=>quoteDuplicateConversion(d.player,2.5),/Invalid/);
assert.throws(()=>quoteDuplicateConversion(d.player,'2'),/Invalid/);
p=await seed({0:10});plan=quoteDuplicateConversion(p,1);
await assert.rejects(()=>convertDuplicates(uid,name,{...request(plan),quote:'tampered'}),/changed/);
assert.equal((await getPlayer(uid,name)).collection[0],10);
conflict=true;await assert.rejects(()=>convertDuplicates(uid,name,request(plan)),/collection changed/);
assert.equal((await getPlayer(uid,name)).xp,999);assert.equal((await getPlayer(uid,name)).collection[0],10);
p=await seed({0:9});plan=quoteDuplicateConversion(p,1);loseResponse=true;
await assert.rejects(()=>convertDuplicates(uid,name,request(plan)),/Response lost/);
d=await convertDuplicates(uid,name,request(plan));assert.equal(d.alreadyConverted,true);assert.equal(d.player.collection[0],1);assert.equal(d.player.collection[1],1);
p=await seed({0:9});plan=quoteDuplicateConversion(p,2);
const parallel=await Promise.allSettled([convertDuplicates(uid,name,request(plan,'concurrent_request_01')),convertDuplicates(uid,name,request(plan,'concurrent_request_02'))]);
assert.equal(parallel.filter(x=>x.status==='fulfilled').length,1);assert.equal((await getPlayer(uid,name)).collection[0],5);
p=await seed(Object.fromEntries(Array.from({length:23},(_,i)=>[i,i===0?25:1])));plan=quoteDuplicateConversion(p,23);
d=await convertDuplicates(uid,name,request(plan));assert.equal(d.albumCompleted,true);assert.equal(d.player.xp,250);assert.equal(d.player.packs,4);assert.equal(conversionCatalog(d.player).targets.length,0);
d=await convertDuplicates(uid,name,request(plan));assert.equal(d.player.xp,250);assert.equal(d.player.packs,4);
await grantPaidPack(uid,name,'verified-payment');d=await grantPaidPack(uid,name,'verified-payment');assert.equal(d.alreadyGranted,true);assert.equal(d.player.packs,5);
console.log('Conversion tests passed: cost, spare-copy preservation, invalid/stale requests, durable replay, lost response, concurrency, CAS conflict, album reward once, paid-pack replay.');

p=await seed({0:1});const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);p.lastDaily=yesterday;p.streak=1;p.activeRun={id:'verified-run',startedAt:Date.now()-30000,day:serverDay()};await savePlayer(p);
d=await recordRun(uid,name,{runId:'verified-run',score:28,bestCombo:11,hits:24,misses:3});assert.equal(d.player.streak,2);assert.equal(d.packGranted,true);const runXp=d.player.xp;
d=await recordRun(uid,name,{runId:'verified-run',score:28,bestCombo:11,hits:24,misses:3});assert.equal(d.alreadyRecorded,true);assert.equal(d.player.xp,runXp);
d=await openPlayerPack(uid,name,{openId:'regression-pack'});const afterPack=JSON.stringify(d.player);
d=await openPlayerPack(uid,name,{openId:'regression-pack'});assert.equal(d.alreadyOpened,true);assert.equal(JSON.stringify(d.player),afterPack);
const {default:handler}=await import('./api/state.js');
async function api(body,authorization){const res={status(n){this.code=n;return this},json(value){this.body=value;return this},setHeader(){}};await handler({method:'POST',headers:{authorization},body},res);return res}
const unauthorized=await api({action:'convert_duplicates',target:2});assert.equal(unauthorized.code,401);
const redisFetch=globalThis.fetch;globalThis.fetch=(url,options)=>url==='https://api.minepi.com/v2/me'?Promise.resolve({ok:true,json:async()=>({uid,username:name})}):redisFetch(url,options);
p=await seed({0:5});const quoteResponse=await api({action:'conversion_quote',target:2},'Bearer test');assert.equal(quoteResponse.code,200);
const convertedResponse=await api({action:'convert_duplicates',...request(quoteResponse.body),cost:0,consumed:[]},'Bearer test');assert.equal(convertedResponse.code,200);assert.equal(convertedResponse.body.cost,4);assert.equal(convertedResponse.body.player.collection[0],1);
console.log('Regression and API tests passed: streak, run/pack replay, authentication, server-owned conversion cost.');
const {selectPlayerAlbum}=await import('./lib/store.js');
p=await seed({0:50});await assert.rejects(()=>selectPlayerAlbum(uid,name,2),/Complete Album 1/);assert.throws(()=>quoteDuplicateConversion(p,24),/Complete Album 1/);
// Legacy inventory migrates intact into Album 1.
p=defaultPlayer(uid,name);delete p.packsByAlbum;delete p.activeAlbum;p.packs=7;db.clear();db.set('sticker:player:'+uid,JSON.stringify(p));p=await getPlayer(uid,name);assert.equal(p.packsByAlbum[1],7);assert.equal(p.packsByAlbum[2],0);
p=await seed(Object.fromEntries(Array.from({length:24},(_,i)=>[i,i===0?50:1])));
d=await selectPlayerAlbum(uid,name,2);assert.equal(d.starterGranted,true);assert.equal(d.player.packs,1);assert.equal(d.player.packsByAlbum[1],1);
d=await selectPlayerAlbum(uid,name,2);assert.equal(d.starterGranted,false);assert.equal(d.player.packs,1);
assert.equal(conversionCatalog(d.player).available,0);assert.throws(()=>quoteDuplicateConversion(d.player,26),/Not enough/);
d=await openPlayerPack(uid,name,{openId:'album-two-open',albumId:2});assert(d.reveal.every(i=>i>=24&&i<48));assert.equal(d.player.packs,0);assert.equal(d.player.packsByAlbum[1],1);
d=await selectPlayerAlbum(uid,name,1);assert.equal(d.player.packs,1);
d=await grantPaidPack(uid,name,'album2-payment',2);assert.equal(d.player.activeAlbum,1);assert.equal(d.player.packs,1);assert.equal(d.player.packsByAlbum[2],1);
d=await grantPaidPack(uid,name,'album2-payment',2);assert.equal(d.alreadyGranted,true);assert.equal(d.player.packsByAlbum[2],1);
// Album 2 completion cannot be triggered by 24 combined stickers.
p=await seed(Object.fromEntries(Array.from({length:47},(_,i)=>[i,i===24?25:1])));
d=await selectPlayerAlbum(uid,name,2);plan=quoteDuplicateConversion(d.player,47);assert.equal(plan.cost,24);assert(plan.consumed.every(x=>x.index>=24));
d=await convertDuplicates(uid,name,request(plan,'ocean_completion_001'));assert.equal(d.albumCompleted,true);assert(d.player.badges.includes('ocean_collector_s2'));assert.equal(d.player.packs,4);assert.equal(d.player.collection[24],1);assert.equal(d.player.collection[0],1);
d=await convertDuplicates(uid,name,request(plan,'ocean_completion_001'));assert.equal(d.player.packs,4);assert.equal(d.player.xp,250);
// Daily reward follows the album at run start, even if selection changes.
p=await seed(Object.fromEntries(Array.from({length:24},(_,i)=>[i,1])));p.activeRun={id:'album-bound-run',startedAt:Date.now()-30000,day:serverDay(),albumId:1};await savePlayer(p);await selectPlayerAlbum(uid,name,2);
d=await recordRun(uid,name,{runId:'album-bound-run',score:28,bestCombo:11,hits:24,misses:3});assert.equal(d.albumId,1);assert.equal(d.player.packsByAlbum[1],2);assert.equal(d.player.packs,1);
// Official payment metadata, not client state, determines delivery.
process.env.PI_API_KEY='test-only';
const payment={identifier:'pi-album2-payment',user_uid:uid,direction:'user_to_app',network:'Pi Testnet',amount:0.01,memo:'Sticker.pi Album 2 Bonus Pack',metadata:{product:'sticker_bonus_pack_testnet_v1',albumId:2},status:{developer_completed:true,transaction_verified:true},transaction:{txid:'verified-tx'}};
const priorFetch=globalThis.fetch;globalThis.fetch=(url,options)=>url.includes('/v2/payments/')?Promise.resolve({ok:true,json:async()=>payment}):priorFetch(url,options);
const {default:paymentHandler}=await import('./api/auth.js');
async function pay(body){const res={status(n){this.code=n;return this},json(body){this.body=body;return this},setHeader(){}};await paymentHandler({method:'POST',headers:{authorization:'Bearer test'},body},res);return res}
await selectPlayerAlbum(uid,name,1);let paid=await pay({action:'complete',paymentId:payment.identifier,txid:'verified-tx'});assert.equal(paid.code,200);assert.equal(paid.body.player.packs,2);assert.equal(paid.body.player.packsByAlbum[2],2);
payment.identifier='legacy-payment';payment.memo='Sticker.pi Bonus Pack';delete payment.metadata.albumId;
await selectPlayerAlbum(uid,name,2);paid=await pay({action:'recover',paymentId:payment.identifier});assert.equal(paid.code,200);assert.equal(paid.body.player.packsByAlbum[1],3);assert.equal(paid.body.player.packs,2);
console.log('Album 2 tests passed: legacy migration, unlock, starter once, separate packs/duplicates, completion once, bound daily rewards and legacy/new payment routing.');
// Recover a confirmed quote after another tab selects a different album.
p=await seed(Object.fromEntries(Array.from({length:24},(_,i)=>[i,1])));d=await selectPlayerAlbum(uid,name,2);d.player.collection[24]=5;await savePlayer(d.player);plan=quoteDuplicateConversion(d.player,26);await selectPlayerAlbum(uid,name,1);
d=await convertDuplicates(uid,name,request(plan,'cross_tab_recovery_01'));assert.equal(d.target,26);assert.equal(d.albumId,2);assert.equal(d.player.activeAlbum,1);assert.equal(d.player.collection[24],1);assert.equal(d.player.collection[26],1);
console.log('Cross-tab conversion recovery remains bound to the confirmed album.');
async function verifiedRun(id,{score=30,bestCombo=0,hits=20,misses=0,albumId=1}={}){
  const p=await getPlayer(uid,name);p.activeRun={id,startedAt:Date.now()-30000,day:serverDay(),albumId};await savePlayer(p);
  return recordRun(uid,name,{runId:id,score,bestCombo,hits,misses});
}
p=await seed({0:1});p.xp=969;delete p.packXpProgress;await savePlayer(p);p=await getPlayer(uid,name);assert.equal(p.packXpProgress,0);assert.equal(p.xp,969);
p.packXpProgress=429;await savePlayer(p);d=await verifiedRun('xp-before-threshold');assert.equal(d.xp,70);assert.equal(d.xpPacksGranted,0);assert.equal(d.player.packXpProgress,499);
d=await verifiedRun('xp-cross-threshold');assert.equal(d.xpPacksGranted,1);assert.equal(d.player.packXpProgress,69);assert.equal(d.player.daily.xpPacksGranted,1);const xpPackBalance=d.player.packs;
d=await recordRun(uid,name,{runId:'xp-cross-threshold',score:30,bestCombo:0,hits:20,misses:0});assert.equal(d.alreadyRecorded,true);assert.equal(d.player.packs,xpPackBalance);assert.equal(d.player.packXpProgress,69);
p=d.player;p.packXpProgress=490;p.daily.xpPacksGranted=2;await savePlayer(p);d=await verifiedRun('xp-third-pack');assert.equal(d.xpPacksGranted,1);assert.equal(d.player.daily.xpPacksGranted,3);assert.equal(d.player.packXpProgress,60);
d=await verifiedRun('xp-after-cap');assert.equal(d.xpPacksGranted,0);assert.equal(d.player.packXpProgress,60);assert.equal(d.player.daily.xpPacksGranted,3);
p=d.player;p.packXpProgress=490;p.daily.date=new Date(Date.now()-86400000).toISOString().slice(0,10);await savePlayer(p);
d=await verifiedRun('xp-next-day',{score:10,hits:10});assert.equal(d.xpPacksGranted,1);assert.equal(d.player.packXpProgress,20);assert.equal(d.player.daily.xpPacksGranted,1);
// Pack-opening and album XP never advance gameplay pack progress.
p=await seed(Object.fromEntries(Array.from({length:24},(_,i)=>[i,1])));p.packXpProgress=499;await savePlayer(p);d=await openPlayerPack(uid,name,{openId:'non-gameplay-xp'});assert.equal(d.player.packXpProgress,499);assert.equal(d.player.daily.xpPacksGranted,0);
console.log('XP pack tests passed: no retroactive XP, threshold and remainder, replay, daily cap, UTC rollover/carry and exclusion of pack/album XP.');

// Daily skill goals require a completed eligible run; retries never count twice.
p=await seed({0:1});
d=await verifiedRun('skill-short',{score:10,hits:10,bestCombo:9});assert.equal(d.player.daily.bestEligibleAccuracy,0);assert.equal(d.player.daily.bestCombo,9);
d=await verifiedRun('skill-rounded',{score:30,hits:26,misses:3,bestCombo:15});assert.equal(d.accuracy,90);assert.equal(d.player.daily.bestEligibleAccuracy,89);
d=await verifiedRun('skill-eligible',{score:30,hits:18,misses:2,bestCombo:15});assert.equal(d.player.daily.bestEligibleAccuracy,90);assert.equal(d.player.daily.runsCompleted,3);assert.equal(d.goalsPackGranted,true);assert.equal(d.player.daily.goalsPackGranted,true);const bonusPacks=d.player.packs;
d=await recordRun(uid,name,{runId:'skill-eligible'});assert.equal(d.player.daily.runsCompleted,3);assert.equal(d.player.packs,bonusPacks);
d=await verifiedRun('skill-fourth',{score:30,hits:18,misses:2,bestCombo:15});assert.equal(d.goalsPackGranted,false);assert.equal(d.player.packs,bonusPacks);
p=d.player;p.daily.date=new Date(Date.now()-86400000).toISOString().slice(0,10);await savePlayer(p);p=await getPlayer(uid,name);assert.equal(p.daily.bestCombo,0);assert.equal(p.daily.bestEligibleAccuracy,0);assert.equal(p.daily.runsCompleted,0);assert.equal(p.daily.goalsPackGranted,false);
console.log('Daily skill goals passed: minimum attempts, exact accuracy threshold, combo, replay and UTC reset.');
// Payment inputs never override the official server lookup; reject invalid fields.
const goodPayment={...payment,identifier:'negative-payment',metadata:{product:'sticker_bonus_pack_testnet_v1'},status:{developer_completed:true,transaction_verified:true},transaction:{txid:'verified-tx'}};
for(const change of [{user_uid:'attacker'},{amount:.02},{network:'Pi Network'},{direction:'app_to_user'},{memo:'wrong'},{metadata:{product:'wrong'}},{metadata:{product:'sticker_bonus_pack_testnet_v1',albumId:'1'}},{status:{cancelled:true}}]){
  Object.assign(payment,goodPayment,change);const before=JSON.stringify(await getPlayer(uid,name));const rejected=await pay({action:'complete',paymentId:payment.identifier,txid:'verified-tx',uid,albumId:1,amount:.01});assert.equal(rejected.code,400);assert.equal(JSON.stringify(await getPlayer(uid,name)),before);
}
Object.assign(payment,goodPayment);assert.equal((await pay({action:'complete',paymentId:payment.identifier,txid:'wrong-tx'})).code,409);
Object.assign(payment,goodPayment,{status:{developer_completed:true,transaction_verified:false}});assert.equal((await pay({action:'complete',paymentId:payment.identifier,txid:'verified-tx'})).code,409);
p=await getPlayer(uid,name);p.activeRun={id:'midnight-run',startedAt:Date.now()-30000,day:'2000-01-01',albumId:1};await savePlayer(p);const beforeMidnight=JSON.stringify(await getPlayer(uid,name));await assert.rejects(()=>recordRun(uid,name,{runId:'midnight-run',score:30,bestCombo:15,hits:20,misses:0}),/UTC day boundary/);assert.equal(JSON.stringify(await getPlayer(uid,name)),beforeMidnight);
console.log('Negative payment/UTC tests passed: forged metadata/UID/amount/network, cancellation, transaction mismatch, unverified transaction and expired run cannot grant inventory.');

Object.assign(payment,goodPayment,{status:{cancelled:true}});assert.equal((await pay({action:'recover',paymentId:payment.identifier})).body.cancelled,true);
Object.assign(payment,goodPayment,{user_uid:'other',status:{cancelled:true}});assert.equal((await pay({action:'recover',paymentId:payment.identifier})).code,400);
console.log('Confirmed cancellation recovery clears a pending request only after server payment ownership/product validation.');
