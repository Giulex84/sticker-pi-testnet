import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const playerWrites=new AsyncLocalStorage(),snapshots=new WeakMap();
const URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
// Preserve existing Testnet inventory keys; challenge seeds retain their Testnet namespace.
const PREFIX='sticker';
const CHALLENGE_NAMESPACE='sticker:testnet';
const metricsUniqueKey=day=>`${PREFIX}:metrics:unique:${day}`;
const metricsEventsKey=day=>`${PREFIX}:metrics:events:${day}`;
const metricsDedupeKey=id=>`${PREFIX}:metrics:dedupe:${id}`;
const dailyLeaderboardKey=day=>`${PREFIX}:daily-leaderboard:${day}`;
const dailyResultKey=(day,uid)=>`${PREFIX}:daily-result:${day}:${uid}`;
const RARITIES=['common','rare','common','common','rare','common','common','epic','epic','rare','rare','common','common','rare','common','epic','rare','common','epic','rare','common','rare','epic','legendary'];
const FIRST_ALBUM_SIZE=24;
RARITIES.push(...RARITIES.slice(0,24));
export function albumIndices(albumId=1){return Array.from({length:24},(_,i)=>(albumId===2?24:0)+i)}
function albumId(value=1){if(value!==1&&value!==2){const e=new Error('Invalid album');e.status=400;throw e}return value}
function albumComplete(p,id){return albumIndices(id).every(i=>Number(p.collection?.[i])>0)}
export function albumUnlocked(p,id){return id===1||albumComplete(p,1)}
function requireAlbum(p,id){albumId(id);if(!albumUnlocked(p,id)){const e=new Error('Complete Album 1 to unlock Album 2');e.status=409;throw e}}
function initializeAlbums(p){
  p.activeAlbum=p.activeAlbum===2?2:1;
  if(!p.packsByAlbum)p.packsByAlbum={1:Math.max(0,Number(p.packs)||0),2:0};
  p.albumStarted=p.albumStarted||{1:true};
  p.packs=Number(p.packsByAlbum[p.activeAlbum])||0;
  return p;
}
function addAlbumPacks(p,id,count){initializeAlbums(p);p.packsByAlbum[id]=(Number(p.packsByAlbum[id])||0)+count;if(p.activeAlbum===id)p.packs=p.packsByAlbum[id]}
export async function selectPlayerAlbum(uid,username,value){return withPlayerLock(uid,async()=>{
  const p=await getPlayer(uid,username),id=albumId(value);requireAlbum(p,id);
  p.activeAlbum=id;p.packs=Number(p.packsByAlbum[id])||0;
  let starterGranted=false;if(!p.albumStarted[id]){p.albumStarted[id]=true;addAlbumPacks(p,id,1);starterGranted=true}
  await savePlayer(p);return{player:p,albumId:id,starterGranted};
})}
export function storageEnabled(){return Boolean(URL&&TOKEN)}
function requireStorage(){if(!storageEnabled()){const e=new Error('Testnet storage is not configured');e.status=503;throw e}}
async function command(args){requireStorage();const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok){const e=new Error('Storage request failed');e.status=503;throw e}const payload=await r.json();if(payload?.error){const e=new Error('Storage command failed');e.status=503;throw e}return payload?.result}
export async function recordMetric(day,subject,event,dedupeId=''){
  const script=`
if ARGV[3]~='' then
  local created=redis.call('SET',KEYS[3],'1','NX','EX',ARGV[4])
  if not created then return 0 end
end
redis.call('PFADD',KEYS[1],ARGV[1])
redis.call('EXPIRE',KEYS[1],ARGV[4])
redis.call('HINCRBY',KEYS[2],ARGV[2],1)
redis.call('EXPIRE',KEYS[2],ARGV[4])
return 1`;
  return Number(await command(['EVAL',script,'3',metricsUniqueKey(day),metricsEventsKey(day),metricsDedupeKey(dedupeId||'none'),subject,event,dedupeId,'34560000']))===1;
}
export async function getMetricsReport(days){
  const count=Math.max(1,Math.min(90,Math.trunc(Number(days)||30))),keys=[],labels=[];
  for(let offset=0;offset<count;offset++){const date=new Date(Date.now()-offset*86400000).toISOString().slice(0,10);labels.push(date);keys.push(metricsUniqueKey(date),metricsEventsKey(date));}
  const script=`local out={}; for i=1,#KEYS,2 do local unique=redis.call('PFCOUNT',KEYS[i]); local events=redis.call('HGETALL',KEYS[i+1]); table.insert(out,{unique=unique,events=events}) end; return cjson.encode(out)`;
  const rows=JSON.parse(await command(['EVAL',script,String(keys.length),...keys]));
  return labels.map((day,index)=>{const pairs=rows[index]?.events||[],events={};for(let i=0;i<pairs.length;i+=2)events[pairs[i]]=Number(pairs[i+1])||0;return{day,uniqueUsers:Number(rows[index]?.unique)||0,events};});
}
async function withPlayerLock(uid,work){
  const key=`${PREFIX}:lock:player:${uid}`,token=randomUUID();
  const acquired=await command(['SET',key,token,'NX','PX',10000]);
  if(acquired!=='OK'){const e=new Error('Another update is in progress. Please retry.');e.status=409;throw e}
  try{return await playerWrites.run({key,token},work)}finally{await command(['EVAL',"if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",'1',key,token]).catch(()=>{})}
}
export async function rateLimit(uid,scope,max,seconds){
  requireStorage();
  const key=`${PREFIX}:rate:${scope}:${uid}:${Math.floor(Date.now()/(seconds*1000))}`;
  const count=Number(await command(['INCR',key]));
  if(count===1)await command(['EXPIRE',key,seconds+2]);
  if(count>max){const e=new Error('Too many requests. Please try again shortly.');e.status=429;throw e}
}
export function serverDay(){return new Date().toISOString().slice(0,10)}
function dailySeed(day=serverDay()){return Number.parseInt(createHash('sha256').update(`${CHALLENGE_NAMESPACE}:daily:${day}:v1`).digest('hex').slice(0,8),16)>>>0}
async function recordDailyRanking(uid,username,result){
  const script=`
local raw=redis.call('GET',KEYS[1])
local next=cjson.decode(ARGV[1])
local best=next
if raw then
  local old=cjson.decode(raw)
  if old.score>next.score or (old.score==next.score and old.accuracy>next.accuracy) or (old.score==next.score and old.accuracy==next.accuracy and old.bestCombo>=next.bestCombo) then best=old end
end
local value=cjson.encode(best)
redis.call('SET',KEYS[1],value,'EX',691200)
redis.call('ZADD',KEYS[2],best.score*1000000+best.accuracy*1000+best.bestCombo,ARGV[2])
redis.call('EXPIRE',KEYS[2],691200)
return value`;
  return JSON.parse(await command(['EVAL',script,'2',dailyResultKey(result.day,uid),dailyLeaderboardKey(result.day),JSON.stringify(result),uid]));
}
export async function getDailyLeaderboard(uid,day=serverDay()){
  const ids=await command(['ZREVRANGE',dailyLeaderboardKey(day),'0','9']),list=Array.isArray(ids)?ids:[];if(!list.length)return{day,leaders:[],position:null};
  const values=await command(['MGET',...list.map(id=>dailyResultKey(day,id))]);const leaders=list.map((id,index)=>{let result={};try{result=values?.[index]?JSON.parse(values[index]):{}}catch{}return{rank:index+1,username:result.username||'Pioneer',score:Number(result.score)||0,accuracy:Number(result.accuracy)||0,bestCombo:Number(result.bestCombo)||0}});const own=await command(['ZREVRANK',dailyLeaderboardKey(day),uid]);return{day,leaders,position:own===null?null:Number(own)+1};
}
function blankDaily(date=serverDay()){return {date,bestScore:0,packsOpened:0,newUnique:0,runPackGranted:false,goalsPackGranted:false,goalsPackAlbum:null,xpPacksGranted:0,runsCompleted:0,bestCombo:0,bestEligibleAccuracy:0}}
export function defaultPlayer(uid,username){return initializeAlbums({version:4,uid,username,level:1,xp:0,packXpProgress:0,streak:0,lastDaily:null,packs:1,collection:{},duplicates:{},badges:[],daily:blankDaily(),stats:{plays:0,bestScore:0,bestCombo:0,packsOpened:0},purchases:{},activeRun:null,runReceipts:{},packReceipts:{},updatedAt:new Date().toISOString()})}
function normalizePlayer(p,uid,username){p.uid=uid;p.username=username||p.username;p.version=4;p.collection=p.collection||{};p.duplicates=p.duplicates||{};p.badges=Array.isArray(p.badges)?p.badges:[];p.stats={plays:0,bestScore:0,bestCombo:0,packsOpened:0,...(p.stats||{})};p.purchases=p.purchases||{};p.activeRun=p.activeRun||null;p.runReceipts=p.runReceipts||{};p.packReceipts=p.packReceipts||{};if(!p.daily||p.daily.date!==serverDay())p.daily=blankDaily();p.daily={...blankDaily(p.daily.date),...p.daily};p.packXpProgress=Math.max(0,Math.min(499,Math.floor(Number(p.packXpProgress)||0)));p.daily.xpPacksGranted=Math.max(0,Math.min(3,Math.floor(Number(p.daily.xpPacksGranted)||0)));p.daily.runsCompleted=Math.max(0,Math.floor(Number(p.daily.runsCompleted)||0));p.daily.bestCombo=Math.max(0,Number(p.daily.bestCombo)||0);p.daily.bestEligibleAccuracy=Math.max(0,Math.min(100,Number(p.daily.bestEligibleAccuracy)||0));return initializeAlbums(p)}
export async function getPlayer(uid,username){
  requireStorage();const raw=await command(['GET',`${PREFIX}:player:${uid}`]);let p;
  if(raw===null||raw===undefined)p=defaultPlayer(uid,username);
  else{try{const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid player');p=normalizePlayer(parsed,uid,username)}catch{const e=new Error('Stored player data requires review');e.status=503;throw e}}
  snapshots.set(p,raw||'');return p;
}
export async function savePlayer(player,receipt=null){
  requireStorage();player.packsByAlbum=player.packsByAlbum||{1:0,2:0};player.packsByAlbum[player.activeAlbum||1]=Math.max(0,Number(player.packs)||0);player.updatedAt=new Date().toISOString();
  const key=`${PREFIX}:player:${player.uid}`,value=JSON.stringify(player),lock=playerWrites.getStore();
  if(lock){
    if(!snapshots.has(player))throw new Error('Missing player snapshot');
    const script=`
if redis.call('GET',KEYS[2])~=ARGV[3] then return 0 end
if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end
if ARGV[4]~='' and redis.call('EXISTS',KEYS[3])==1 then return 0 end
redis.call('SET',KEYS[1],ARGV[2])
if ARGV[4]~='' then redis.call('SET',KEYS[3],ARGV[4]) end
return 1`;
    const committed=await command(['EVAL',script,'3',key,lock.key,receipt?.key||key,snapshots.get(player),value,lock.token,receipt?JSON.stringify(receipt.value):'']);
    if(Number(committed)!==1){const e=new Error('Your player state changed. Retry after loading saved progress.');e.status=409;throw e}
  }else await command(['SET',key,value]);
  snapshots.set(player,value);return true;
}

function previousDay(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function cleanInt(value,min,max){const n=Math.floor(Number(value));return Number.isFinite(n)&&n>=min&&n<=max?n:null}
export async function startRun(uid,username){return withPlayerLock(uid,async()=>{const p=await getPlayer(uid,username),now=Date.now();if(p.activeRun&&now-Number(p.activeRun.startedAt)<20000){const e=new Error('A run is already active');e.status=409;throw e}const runId=randomUUID(),day=serverDay(),challengeSeed=dailySeed(day);p.activeRun={id:runId,startedAt:now,day,challengeSeed,albumId:p.activeAlbum};await savePlayer(p);return{player:p,runId,startedAt:now,day,challengeSeed}})}
export async function recordRun(uid,username,input){return withPlayerLock(uid,async()=>{
  const p=await getPlayer(uid,username),runId=String(input?.runId||'').slice(0,80);
  if(!runId){const e=new Error('Missing run identifier');e.status=400;throw e}
  if(p.runReceipts[runId]){const receipt=p.runReceipts[runId];if(receipt.day)await recordDailyRanking(uid,username,{...receipt,username:String(username||'Pioneer').slice(0,64)});return {player:p,...receipt,alreadyRecorded:true}};
  const score=cleanInt(input?.score,0,100),bestCombo=cleanInt(input?.bestCombo,0,60),hits=cleanInt(input?.hits,0,120),misses=cleanInt(input?.misses,0,120),now=Date.now(),age=now-Number(p.activeRun?.startedAt||0);
  if(!p.activeRun||p.activeRun.id!==runId||age<20000||age>120000||score===null||bestCombo===null||hits===null||misses===null||bestCombo>hits||score>hits*4+5){const e=new Error('Invalid run result');e.status=400;throw e}
  const day=serverDay();if(p.activeRun.day&&p.activeRun.day!==day){const e=new Error('Daily run expired at the UTC day boundary');e.status=409;throw e}if(p.lastDaily!==day){p.streak=p.lastDaily===previousDay(day)?Math.max(1,Number(p.streak)||0)+1:1;p.lastDaily=day}
  const xp=10+score*2+Math.floor(bestCombo/2);p.xp=Math.max(0,Number(p.xp)||0)+xp;p.level=Math.floor(p.xp/100)+1;
  p.stats.plays=Math.max(0,Number(p.stats.plays)||0)+1;p.stats.bestScore=Math.max(Number(p.stats.bestScore)||0,score);p.stats.bestCombo=Math.max(Number(p.stats.bestCombo)||0,bestCombo);p.daily.bestScore=Math.max(Number(p.daily.bestScore)||0,score);
  const rewardAlbum=p.activeRun.albumId||1;let packGranted=false;if(score>=25&&!p.daily.runPackGranted){addAlbumPacks(p,rewardAlbum,1);p.daily.runPackGranted=true;packGranted=true}
  let xpPacksGranted=0;
  if(p.daily.xpPacksGranted<3){
    const accumulated=p.packXpProgress+xp;
    xpPacksGranted=Math.min(Math.floor(accumulated/500),3-p.daily.xpPacksGranted);
    p.packXpProgress=accumulated-xpPacksGranted*500;
    p.daily.xpPacksGranted+=xpPacksGranted;
    if(xpPacksGranted)addAlbumPacks(p,rewardAlbum,xpPacksGranted);
  }
  p.daily.runsCompleted++;
  const attempts=hits+misses,accuracy=attempts?Math.round(hits/attempts*100):100;p.daily.bestCombo=Math.max(p.daily.bestCombo,bestCombo);if(attempts>=20)p.daily.bestEligibleAccuracy=Math.max(p.daily.bestEligibleAccuracy,Math.floor(hits/attempts*100));let goalsPackGranted=false;
  if(!p.daily.goalsPackGranted&&p.daily.runPackGranted&&p.daily.runsCompleted>=3&&p.daily.bestEligibleAccuracy>=90&&p.daily.bestCombo>=15){addAlbumPacks(p,rewardAlbum,1);p.daily.goalsPackGranted=true;p.daily.goalsPackAlbum=rewardAlbum;goalsPackGranted=true}
  p.activeRun=null;p.lastRunAt=new Date(now).toISOString();const receipt={xp,packGranted,xpPacksGranted,goalsPackGranted,albumId:rewardAlbum,score,bestCombo,accuracy,day,completedAt:new Date(now).toISOString()};p.runReceipts[runId]=receipt;const ids=Object.keys(p.runReceipts);if(ids.length>20)ids.slice(0,ids.length-20).forEach(id=>delete p.runReceipts[id]);await savePlayer(p);await recordDailyRanking(uid,username,{day,username:String(username||'Pioneer').slice(0,64),score,accuracy,bestCombo,completedAt:new Date(now).toISOString()});return{player:p,...receipt,alreadyRecorded:false}
})}
function weightedSticker(id=1){const r=Math.random();let rarity='common';if(r<.04)rarity='legendary';else if(r<.18)rarity='epic';else if(r<.48)rarity='rare';const pool=albumIndices(id).map(index=>({value:RARITIES[index],index})).filter(x=>x.value===rarity);return pool[Math.floor(Math.random()*pool.length)].index}
function applyAlbumCompletion(p,id=p.activeAlbum||1){
  const badge=id===1?'master_collector_s1':'ocean_collector_s2';
  if(!albumComplete(p,id)||p.badges.includes(badge))return false;
  p.badges.push(badge);p.albumCompletedDates={...(p.albumCompletedDates||{}),[id]:new Date().toISOString()};
  if(id===1)p.albumCompletedAt=p.albumCompletedDates[id];
  p.xp=Math.max(0,Number(p.xp)||0)+250;p.level=Math.floor(p.xp/100)+1;
  // Sync any pack decrement before applying the celebration reward.
  p.packsByAlbum[p.activeAlbum||1]=Math.max(0,Number(p.packs)||0);
  addAlbumPacks(p,id,3);return true;
}
export async function openPlayerPack(uid,username,input){return withPlayerLock(uid,async()=>{
  const p=await getPlayer(uid,username),id=albumId(input?.albumId??1),openId=String(input?.openId||'').slice(0,80);if(!openId){const e=new Error('Missing pack identifier');e.status=400;throw e}const receiptKey=`${PREFIX}:pack:${uid}:${openId}`,savedReceipt=await command(['GET',receiptKey]);if(savedReceipt||p.packReceipts[openId]){const receipt=savedReceipt?JSON.parse(savedReceipt):p.packReceipts[openId];if((receipt.albumId||1)!==id){const e=new Error('Pack identifier belongs to another album');e.status=409;throw e}return {player:p,...receipt,alreadyOpened:true}};requireAlbum(p,id);if(id!==p.activeAlbum){const e=new Error('Selected album changed');e.status=409;throw e}if((Number(p.packs)||0)<1){const e=new Error('No packs available');e.status=409;throw e}p.packs--;p.stats.packsOpened=Math.max(0,Number(p.stats.packsOpened)||0)+1;p.daily.packsOpened++;
  const reveal=[],cards=[];for(let x=0;x<3;x++){let i;do{i=weightedSticker(id)}while(reveal.includes(i));const prev=Math.max(0,Number(p.collection[i])||0),isNew=prev===0;p.collection[i]=prev+1;if(!isNew)p.duplicates[i]=Math.max(0,Number(p.duplicates[i])||0)+1;else p.daily.newUnique++;reveal.push(i);cards.push({index:i,isNew,copyCount:prev+1})}
  p.xp=Math.max(0,Number(p.xp)||0)+15;p.level=Math.floor(p.xp/100)+1;const albumCompleted=applyAlbumCompletion(p);p.packReceipts[openId]={albumId:id,reveal,cards,xp:15,albumCompleted};const ids=Object.keys(p.packReceipts);if(ids.length>20)ids.slice(0,ids.length-20).forEach(id=>delete p.packReceipts[id]);await savePlayer(p,{key:receiptKey,value:p.packReceipts[openId]});return {player:p,albumId:id,reveal,cards,xp:15,albumCompleted,alreadyOpened:false}
})}
export async function claimAlbumReward(uid,username){return withPlayerLock(uid,async()=>{const p=await getPlayer(uid,username),albumCompleted=applyAlbumCompletion(p);if(albumCompleted)await savePlayer(p);return {player:p,albumCompleted,alreadyClaimed:p.badges.includes(p.activeAlbum===2?'ocean_collector_s2':'master_collector_s1')&&!albumCompleted}})}
export async function grantPaidPack(uid,username,paymentId,targetAlbum=1){return withPlayerLock(uid,async()=>{const p=await getPlayer(uid,username);if(p.purchases[paymentId])return {player:p,alreadyGranted:true};const id=albumId(targetAlbum);requireAlbum(p,id);p.purchases[paymentId]={albumId:id,product:'sticker_bonus_pack_testnet_v1',at:new Date().toISOString()};addAlbumPacks(p,id,1);await savePlayer(p);return {player:p,albumId:id,alreadyGranted:false}})}

// Conversion spends extra sticker copies only; there is no currency or payment.
const CONVERSION_COSTS={common:4,rare:8,epic:16,legendary:24};
function conversionError(message,status=400){const e=new Error(message);e.status=status;return e}
function conversionTarget(value){
  if(!Number.isInteger(value)||value<0||value>=RARITIES.length)throw conversionError('Invalid target sticker');
  return value;
}
function spareCopies(p,index){const n=Number(p.collection?.[index]);return Number.isSafeInteger(n)&&n>1?n-1:0}
export function conversionCatalog(p){
  const id=p.activeAlbum||1,available=albumIndices(id).reduce((sum,i)=>sum+spareCopies(p,i),0);
  return {albumId:id,costs:CONVERSION_COSTS,available,targets:albumIndices(id).map(index=>({index,rarity:RARITIES[index],cost:CONVERSION_COSTS[RARITIES[index]]})).filter(x=>!(Number(p.collection?.[x.index])>0))};
}
export function quoteDuplicateConversion(p,targetValue){
  const target=conversionTarget(targetValue),id=target<24?1:2;requireAlbum(p,id);if(id!==(p.activeAlbum||1))throw conversionError('Selected album changed',409);
  if(Number(p.collection?.[target])>0)throw conversionError('You already own this sticker',409);
  const cost=CONVERSION_COSTS[RARITIES[target]],available=conversionCatalog(p).available;
  if(available<cost)throw conversionError('Not enough duplicate copies',409);
  // Lowest rarity first, then stable album order. Never spend the last copy.
  const order=albumIndices(id).map(index=>({index,rank:CONVERSION_COSTS[RARITIES[index]]})).sort((a,b)=>a.rank-b.rank||a.index-b.index);
  let remaining=cost;const consumed=[];
  for(const {index} of order){const count=Math.min(remaining,spareCopies(p,index));if(count){consumed.push({index,count});remaining-=count}if(!remaining)break}
  const quote=createHash('sha256').update(JSON.stringify({uid:p.uid,version:1,target,cost,consumed})).digest('hex');
  return {albumId:id,target,cost,consumed,quote};
}
export async function convertDuplicates(uid,username,input){
  const conversionId=input?.conversionId,target=conversionTarget(input?.target);
  if(typeof conversionId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(conversionId))throw conversionError('Invalid conversion identifier');
  return withPlayerLock(uid,async()=>{
    const receiptKey=`${PREFIX}:conversion:${uid}:${conversionId}`,previous=await command(['GET',receiptKey]);
    if(previous){const receipt=JSON.parse(previous);if(receipt.target!==target)throw conversionError('Conversion identifier belongs to another sticker',409);return {player:await getPlayer(uid,username),...receipt,alreadyConverted:true}}
    const playerKey=`${PREFIX}:player:${uid}`,raw=await command(['GET',playerKey]);
    const p=raw?normalizePlayer(JSON.parse(raw),uid,username):defaultPlayer(uid,username);
    const plan=quoteDuplicateConversion({...p,activeAlbum:target<24?1:2},target);
    if(input?.quote!==plan.quote)throw conversionError('Your duplicates changed. Review the conversion again.',409);
    for(const {index,count} of plan.consumed){p.collection[index]-=count;p.duplicates[index]=p.collection[index]-1}
    p.collection[target]=1;p.duplicates[target]=0;p.daily.newUnique++;
    const albumCompleted=applyAlbumCompletion(p,plan.albumId);
    p.updatedAt=new Date().toISOString();
    p.packsByAlbum[p.activeAlbum||1]=p.packs;const receipt={conversionId,albumId:plan.albumId,target,cost:plan.cost,consumed:plan.consumed,albumCompleted};
    // Persist the collection and durable receipt together. A stale lock holder
    // cannot overwrite a newer player update; a lost response is safe to retry.
    const script=`
local old=redis.call('GET',KEYS[1])
if redis.call('GET',KEYS[3])~=ARGV[4] then return 0 end
if (old or '')~=ARGV[1] then return 0 end
if redis.call('EXISTS',KEYS[2])==1 then return 0 end
redis.call('SET',KEYS[1],ARGV[2])
redis.call('SET',KEYS[2],ARGV[3])
return 1`;
    const committed=await command(['EVAL',script,'3',playerKey,receiptKey,playerWrites.getStore().key,raw||'',JSON.stringify(p),JSON.stringify(receipt),playerWrites.getStore().token]);
    if(Number(committed)!==1)throw conversionError('Your collection changed. Review the conversion again.',409);
    return {player:p,...receipt,alreadyConverted:false};
  });
}
