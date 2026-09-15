const URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';

export function storageEnabled(){return Boolean(URL&&TOKEN)}

async function command(args){
  if(!storageEnabled())return null;
  const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok){const e=new Error('Storage request failed');e.status=503;throw e}
  const data=await r.json();
  return data?.result;
}

export function defaultPlayer(uid,username){
  return {
    version:1,uid,username,level:1,xp:0,streak:0,lastDaily:null,
    packs:1,collection:{},duplicates:{},badges:[],
    stats:{plays:0,bestScore:0,packsOpened:0},
    purchases:{},updatedAt:new Date().toISOString()
  };
}

export async function getPlayer(uid,username){
  if(!storageEnabled())return defaultPlayer(uid,username);
  const raw=await command(['GET',`sticker:player:${uid}`]);
  if(!raw)return defaultPlayer(uid,username);
  try{
    const p=JSON.parse(raw);
    p.uid=uid;p.username=username||p.username;p.collection=p.collection||{};p.duplicates=p.duplicates||{};p.stats=p.stats||{};p.purchases=p.purchases||{};
    return p;
  }catch{return defaultPlayer(uid,username)}
}

export async function savePlayer(player){
  if(!storageEnabled())return false;
  player.updatedAt=new Date().toISOString();
  await command(['SET',`sticker:player:${player.uid}`,JSON.stringify(player)]);
  return true;
}

export async function grantPaidPack(uid,username,paymentId){
  const p=await getPlayer(uid,username);
  if(p.purchases?.[paymentId])return {player:p,alreadyGranted:true};
  p.purchases[paymentId]={product:'sticker_bonus_pack_testnet_v1',at:new Date().toISOString()};
  p.packs=Math.max(0,Number(p.packs)||0)+1;
  await savePlayer(p);
  return {player:p,alreadyGranted:false};
}
