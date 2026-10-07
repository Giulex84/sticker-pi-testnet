import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {startRedis}=createRequire(import.meta.url)('./redis-helper.cjs');
const redis=await startRedis();if(!redis)process.exit(0);
process.env.UPSTASH_REDIS_REST_URL='https://redis.test.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';globalThis.fetch=redis.fetch;
try {
  const s=await import('../lib/store.js'),uid='redis-tester',pk='sticker:player:'+uid;
  async function seed(collection={}) {const p=s.defaultPlayer(uid,'Tester');p.collection=collection;await s.savePlayer(p);return p;}
  let p=await seed();p.packs=30;await s.savePlayer(p);
  await s.openPlayerPack(uid,'Tester',{openId:'original-pack',albumId:1});
  for(let i=0;i<21;i++)await s.openPlayerPack(uid,'Tester',{openId:'following-'+i,albumId:1});
  let before=await s.getPlayer(uid,'Tester');const replay=await s.openPlayerPack(uid,'Tester',{openId:'original-pack',albumId:1});assert.equal(replay.alreadyOpened,true,'Old pack ID stays idempotent beyond 20 opens');assert.equal(replay.player.packs,before.packs);
  // Lose only the reply, after the actual Lua script has committed inventory + receipt.
  let lost=false;globalThis.fetch=async(url,o)=>{const r=await redis.fetch(url,o),a=JSON.parse(o.body);if(!lost&&a[0]==='EVAL'&&a[1].includes('ARGV[4]')){lost=true;throw Error('Response lost after commit')}return r};
  before=await s.getPlayer(uid,'Tester');await assert.rejects(()=>s.openPlayerPack(uid,'Tester',{openId:'lost-open',albumId:1}),/Response lost/);
  let d=await s.openPlayerPack(uid,'Tester',{openId:'lost-open',albumId:1});assert.equal(d.alreadyOpened,true);assert.equal(d.player.packs,before.packs-1);globalThis.fetch=redis.fetch;
  // A stale lock holder and a newer player snapshot can never be overwritten.
  for(const fault of ['lock','snapshot']) {
    await seed({0:5});let injected=false;
    globalThis.fetch=async(url,o)=>{const a=JSON.parse(o.body);if(!injected&&a[0]==='EVAL'&&a[1].includes('ARGV[4]')){injected=true;if(fault==='lock')await redis.command(['SET',a[4],'new-lock-owner']);else{const newer=JSON.parse(await redis.command(['GET',pk]));newer.xp=999;await redis.command(['SET',pk,JSON.stringify(newer)])}}return redis.fetch(url,o)};
    await assert.rejects(()=>s.openPlayerPack(uid,'Tester',{openId:'stale-'+fault,albumId:1}),/state changed/);globalThis.fetch=redis.fetch;const saved=await s.getPlayer(uid,'Tester');assert.equal(saved.packs,1);assert.equal(saved.collection[0],5);if(fault==='snapshot')assert.equal(saved.xp,999);await redis.command(['DEL','sticker:lock:player:'+uid]);
  }
  p=await seed(Object.fromEntries(Array.from({length:23},(_,i)=>[i,i===0?25:1])));const plan=s.quoteDuplicateConversion(p,23),input={target:23,quote:plan.quote,conversionId:'redis_conversion_001'};lost=false;
  globalThis.fetch=async(url,o)=>{const r=await redis.fetch(url,o),a=JSON.parse(o.body);if(!lost&&a[0]==='EVAL'&&a[1].includes('local old=')){lost=true;throw Error('Response lost after commit')}return r};
  await assert.rejects(()=>s.convertDuplicates(uid,'Tester',input),/Response lost/);d=await s.convertDuplicates(uid,'Tester',input);assert.equal(d.alreadyConverted,true);assert.equal(d.player.collection[0],1);assert.equal(d.player.collection[23],1);assert.equal(d.player.xp,250);assert.equal(d.player.packs,4);globalThis.fetch=redis.fetch;
  await s.grantPaidPack(uid,'Tester','payment-repeat');await s.grantPaidPack(uid,'Tester','payment-repeat');assert.equal((await s.getPlayer(uid,'Tester')).packs,5);
  // Old players migrate lazily without rewriting the stored record merely on read.
  const legacy={...s.defaultPlayer(uid,'Tester'),packs:7,collection:{0:3},purchases:{old:true}};delete legacy.packsByAlbum;delete legacy.activeAlbum;const raw=JSON.stringify(legacy);await redis.command(['SET',pk,raw]);p=await s.getPlayer(uid,'Tester');assert.equal(p.packsByAlbum[1],7);assert.equal(p.packsByAlbum[2],0);assert.equal(p.collection[0],3);assert.equal(await redis.command(['GET',pk]),raw);
  await redis.command(['SET',pk,'corrupt']);await assert.rejects(()=>s.getPlayer(uid,'Tester'),/requires review/);assert.equal(await redis.command(['GET',pk]),'corrupt');
  globalThis.fetch=async()=>({ok:true,json:async()=>({error:'ERR simulated command failure'})});await assert.rejects(()=>s.getPlayer(uid,'Tester'),/Storage command failed/);globalThis.fetch=redis.fetch;
  await Promise.all([s.recordMetric(s.serverDay(),'subject','run_completed','same-run'),s.recordMetric(s.serverDay(),'subject','run_completed','same-run')]);assert.equal((await s.getMetricsReport(1))[0].events.run_completed,1);
  p=await seed();p.activeRun={id:'rank-repair-run',startedAt:Date.now()-30000,day:s.serverDay(),albumId:1};await s.savePlayer(p);let failedRank=false;globalThis.fetch=async(url,o)=>{const a=JSON.parse(o.body);if(!failedRank&&a[0]==='EVAL'&&a[2]==='2'){failedRank=true;throw Error('Ranking unavailable')}return redis.fetch(url,o)};const run={runId:'rank-repair-run',score:30,bestCombo:15,hits:20,misses:0};await assert.rejects(()=>s.recordRun(uid,'Tester',run),/Ranking unavailable/);const xpBefore=(await s.getPlayer(uid,'Tester')).xp;d=await s.recordRun(uid,'Tester',run);assert.equal(d.alreadyRecorded,true);assert.equal(d.player.xp,xpBefore);assert.equal((await s.getDailyLeaderboard(uid)).leaders[0].score,30);globalThis.fetch=redis.fetch;
  const rankingState=await s.getPlayer(uid,'Tester');rankingState.activeRun={id:'better-ranking',startedAt:Date.now()-30000,day:s.serverDay(),albumId:1};await s.savePlayer(rankingState);await s.recordRun(uid,'Tester',{runId:'better-ranking',score:40,bestCombo:15,hits:20,misses:0});await s.recordRun(uid,'Tester',run);assert.equal((await s.getDailyLeaderboard(uid)).leaders[0].score,40);
  // All-four bonus: one server-day reward, run-bound album, atomic lost-reply recovery.
  p=await seed();p.daily.runPackGranted=true;p.daily.runsCompleted=2;p.daily.bestEligibleAccuracy=90;p.daily.bestCombo=15;p.daily.xpPacksGranted=3;
  p.collection=Object.fromEntries(Array.from({length:24},(_,i)=>[i,1]));p.activeAlbum=1;
  p.activeRun={id:'goals-bonus-run',startedAt:Date.now()-30000,day:s.serverDay(),albumId:2};await s.savePlayer(p);
  const bonusRun={runId:'goals-bonus-run',score:25,bestCombo:15,hits:20,misses:0};let bonusLost=false;
  globalThis.fetch=async(url,o)=>{const r=await redis.fetch(url,o),a=JSON.parse(o.body);if(!bonusLost&&a[0]==='EVAL'&&a[1].includes('ARGV[4]')){bonusLost=true;throw Error('Bonus response lost after commit')}return r};
  await assert.rejects(()=>s.recordRun(uid,'Tester',bonusRun),/Bonus response lost/);globalThis.fetch=redis.fetch;
  d=await s.recordRun(uid,'Tester',bonusRun);assert.equal(d.alreadyRecorded,true);assert.equal(d.goalsPackGranted,true);assert.equal(d.player.daily.goalsPackAlbum,2);assert.equal(d.player.packsByAlbum[2],1);assert.equal(d.player.packsByAlbum[1],1);assert.equal(d.player.xp,67);assert.equal(d.player.daily.xpPacksGranted,3);
  p=d.player;p.activeRun={id:'goals-again',startedAt:Date.now()-30000,day:s.serverDay(),albumId:2};await s.savePlayer(p);d=await s.recordRun(uid,'Tester',{...bonusRun,runId:'goals-again'});assert.equal(d.goalsPackGranted,false);assert.equal(d.player.packsByAlbum[2],1);
  // A missing accuracy goal cannot earn the bonus; today's flag resets on a new UTC day.
  p=await seed();p.daily.runPackGranted=true;p.daily.runsCompleted=2;p.daily.bestCombo=15;p.activeRun={id:'goals-ineligible',startedAt:Date.now()-30000,day:s.serverDay(),albumId:1};await s.savePlayer(p);
  d=await s.recordRun(uid,'Tester',{...bonusRun,runId:'goals-ineligible',hits:18,misses:3});assert.equal(d.goalsPackGranted,false);
  p=d.player;p.daily.date=new Date(Date.now()-86400000).toISOString().slice(0,10);p.daily.goalsPackGranted=true;await s.savePlayer(p);p=await s.getPlayer(uid,'Tester');assert.equal(p.daily.goalsPackGranted,false);assert.equal(p.daily.goalsPackAlbum,null);
  console.log('Daily goals bonus: qualifying run, album isolation, XP cap independence, lost reply/retry, once per day and UTC reset passed.');
  process.env.STICKER_METRICS_SECRET='test-only';const metrics=await import('../lib/metrics.js');const previousDay=new Date(Date.now()-86400000).toISOString().slice(0,10);await metrics.safeRecordMetric(uid,'run_completed','midnight-event',previousDay);assert.equal((await s.getMetricsReport(2))[1].events.run_completed,1);
  console.log('Real Redis: durable pack/paid/conversion replay, lost replies, expired-lock/snapshot fencing, last-copy/completion once, legacy preservation, corrupt/error fail-closed and telemetry dedupe passed.');
} finally {await redis.stop()}
