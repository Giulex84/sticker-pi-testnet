import {verifyPiUser,apiError} from '../lib/pi.js';
import {getPlayer,savePlayer,storageEnabled} from '../lib/store.js';

const MAX_SCORE=9999;
const MAX_XP=1000000;

function sanitizePlayer(input,current,user){
  const out={...current};
  out.uid=user.uid;out.username=user.username;
  if(input&&typeof input==='object'){
    if(Number.isFinite(Number(input.xp)))out.xp=Math.max(0,Math.min(MAX_XP,Math.floor(Number(input.xp))));
    if(Number.isFinite(Number(input.level)))out.level=Math.max(1,Math.min(100,Math.floor(Number(input.level))));
    if(Number.isFinite(Number(input.streak)))out.streak=Math.max(0,Math.min(3650,Math.floor(Number(input.streak))));
    if(typeof input.lastDaily==='string'||input.lastDaily===null)out.lastDaily=input.lastDaily;
    if(Number.isFinite(Number(input.packs)))out.packs=Math.max(0,Math.min(999,Math.floor(Number(input.packs))));
    if(input.collection&&typeof input.collection==='object')out.collection=input.collection;
    if(input.duplicates&&typeof input.duplicates==='object')out.duplicates=input.duplicates;
    if(Array.isArray(input.badges))out.badges=input.badges.slice(0,50).map(String);
    if(input.stats&&typeof input.stats==='object'){
      out.stats={
        plays:Math.max(0,Math.min(100000,Math.floor(Number(input.stats.plays)||0))),
        bestScore:Math.max(0,Math.min(MAX_SCORE,Math.floor(Number(input.stats.bestScore)||0))),
        packsOpened:Math.max(0,Math.min(100000,Math.floor(Number(input.stats.packsOpened)||0)))
      };
    }
  }
  out.updatedAt=new Date().toISOString();
  return out;
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
    const user=await verifyPiUser(req);
    const current=await getPlayer(user.uid,user.username);
    if(req.method==='GET')return res.status(200).json({success:true,storage:storageEnabled(),player:current});
    const body=req.body||{};
    if(body.action==='load'||!body.action)return res.status(200).json({success:true,storage:storageEnabled(),player:current});
    if(body.action!=='save')return res.status(400).json({success:false,error:'Invalid state action'});
    const player=sanitizePlayer(body.player,current,user);
    const persisted=await savePlayer(player);
    return res.status(200).json({success:true,storage:persisted,player});
  }catch(error){return apiError(res,error)}
}
