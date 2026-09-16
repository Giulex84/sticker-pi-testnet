const URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const RARITIES=['common','rare','common','common','rare','common','common','epic','epic','rare','rare','common','common','rare','common','epic','rare','common','epic','rare','common','rare','epic','legendary'];
export function storageEnabled(){return Boolean(URL&&TOKEN)}
async function command(args){if(!storageEnabled())return null;const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok){const e=new Error('Storage request failed');e.status=503;throw e}return (await r.json())?.result}
export function serverDay(){return new Date().toISOString().slice(0,10)}
function blankDaily(date=serverDay()){return {date,bestScore:0,packsOpened:0,newUnique:0,runPackGranted:false}}
export function defaultPlayer(uid,username){return {version:3,uid,username,level:1,xp:0,streak:0,lastDaily:null,packs:1,collection:{},duplicates:{},badges:[],daily:blankDaily(),stats:{plays:0,bestScore:0,bestCombo:0,packsOpened:0},purchases:{},runReceipts:{},packReceipts:{},updatedAt:new Date().toISOString()}}
function normalizePlayer(p,uid,username){p.uid=uid;p.username=username||p.username;p.version=3;p.collection=p.collection||{};p.duplicates=p.duplicates||{};p.badges=Array.isArray(p.badges)?p.badges:[];p.stats={plays:0,bestScore:0,bestCombo:0,packsOpened:0,...(p.stats||{})};p.purchases=p.purchases||{};p.runReceipts=p.runReceipts||{};p.packReceipts=p.packReceipts||{};if(!p.daily||p.daily.date!==serverDay())p.daily=blankDaily();return p}
export async function getPlayer(uid,username){if(!storageEnabled())return defaultPlayer(uid,username);const raw=await command(['GET',`sticker:player:${uid}`]);if(!raw)return defaultPlayer(uid,username);try{return normalizePlayer(JSON.parse(raw),uid,username)}catch{return defaultPlayer(uid,username)}}
export async function savePlayer(player){if(!storageEnabled())return false;player.updatedAt=new Date().toISOString();await command(['SET',`sticker:player:${player.uid}`,JSON.stringify(player)]);return true}
function previousDay(date){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
function cleanInt(value,min,max){const n=Math.floor(Number(value));return Number.isFinite(n)&&n>=min&&n<=max?n:null}
export async function recordRun(uid,username,input){
  const p=await getPlayer(uid,username),runId=String(input?.runId||'').slice(0,80);
  if(!runId){const e=new Error('Missing run identifier');e.status=400;throw e}
  if(p.runReceipts[runId])return {player:p,...p.runReceipts[runId],alreadyRecorded:true};
  const score=cleanInt(input?.score,0,100),bestCombo=cleanInt(input?.bestCombo,0,60),hits=cleanInt(input?.hits,0,120),misses=cleanInt(input?.misses,0,120);
  if(score===null||bestCombo===null||hits===null||misses===null||score>hits*4+5){const e=new Error('Invalid run result');e.status=400;throw e}
  const now=Date.now();if(p.lastRunAt&&now-new Date(p.lastRunAt).getTime()<20000){const e=new Error('Please wait before submitting another run');e.status=429;throw e}
  const day=serverDay();if(p.lastDaily!==day){p.streak=p.lastDaily===previousDay(day)?Math.max(1,Number(p.streak)||0)+1:1;p.lastDaily=day}
  const xp=10+score*2+Math.floor(bestCombo/2);p.xp=Math.max(0,Number(p.xp)||0)+xp;p.level=Math.floor(p.xp/100)+1;
  p.stats.plays=Math.max(0,Number(p.stats.plays)||0)+1;p.stats.bestScore=Math.max(Number(p.stats.bestScore)||0,score);p.stats.bestCombo=Math.max(Number(p.stats.bestCombo)||0,bestCombo);p.daily.bestScore=Math.max(Number(p.daily.bestScore)||0,score);
  let packGranted=false;if(score>=25&&!p.daily.runPackGranted){p.packs=Math.max(0,Number(p.packs)||0)+1;p.daily.runPackGranted=true;packGranted=true}
  p.lastRunAt=new Date(now).toISOString();const receipt={xp,packGranted,score,bestCombo};p.runReceipts[runId]=receipt;const ids=Object.keys(p.runReceipts);if(ids.length>20)ids.slice(0,ids.length-20).forEach(id=>delete p.runReceipts[id]);await savePlayer(p);return {player:p,...receipt,alreadyRecorded:false}
}
function weightedSticker(){const r=Math.random();let rarity='common';if(r<.04)rarity='legendary';else if(r<.18)rarity='epic';else if(r<.48)rarity='rare';const pool=RARITIES.map((value,index)=>({value,index})).filter(x=>x.value===rarity);return pool[Math.floor(Math.random()*pool.length)].index}
export async function openPlayerPack(uid,username,input){
  const p=await getPlayer(uid,username),openId=String(input?.openId||'').slice(0,80);if(!openId){const e=new Error('Missing pack identifier');e.status=400;throw e}if(p.packReceipts[openId])return {player:p,...p.packReceipts[openId],alreadyOpened:true};if((Number(p.packs)||0)<1){const e=new Error('No packs available');e.status=409;throw e}p.packs--;p.stats.packsOpened=Math.max(0,Number(p.stats.packsOpened)||0)+1;p.daily.packsOpened++;
  const reveal=[],cards=[];for(let x=0;x<3;x++){let i;do{i=weightedSticker()}while(reveal.includes(i));const prev=Math.max(0,Number(p.collection[i])||0),isNew=prev===0;p.collection[i]=prev+1;if(!isNew)p.duplicates[i]=Math.max(0,Number(p.duplicates[i])||0)+1;else p.daily.newUnique++;reveal.push(i);cards.push({index:i,isNew,copyCount:prev+1})}
  p.xp=Math.max(0,Number(p.xp)||0)+15;p.level=Math.floor(p.xp/100)+1;p.packReceipts[openId]={reveal,cards,xp:15};const ids=Object.keys(p.packReceipts);if(ids.length>20)ids.slice(0,ids.length-20).forEach(id=>delete p.packReceipts[id]);await savePlayer(p);return {player:p,reveal,cards,xp:15,alreadyOpened:false}
}
export async function grantPaidPack(uid,username,paymentId){const p=await getPlayer(uid,username);if(p.purchases[paymentId])return {player:p,alreadyGranted:true};p.purchases[paymentId]={product:'sticker_bonus_pack_testnet_v1',at:new Date().toISOString()};p.packs=Math.max(0,Number(p.packs)||0)+1;await savePlayer(p);return {player:p,alreadyGranted:false}}
