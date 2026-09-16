import {verifyPiUser,apiError} from '../lib/pi.js';
import {getPlayer,startRun,recordRun,openPlayerPack,rateLimit,storageEnabled,serverDay} from '../lib/store.js';
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
    const user=await verifyPiUser(req),body=req.body||{},action=req.method==='GET'?'load':body.action||'load';
    await rateLimit(user.uid,action,action==='load'?60:12,60);
    if(action==='load')return res.status(200).json({success:true,storage:storageEnabled(),serverDay:serverDay(),player:await getPlayer(user.uid,user.username)});
    if(!storageEnabled())return res.status(503).json({success:false,error:'Cloud storage is required for this action'});
    if(action==='start_run')return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...await startRun(user.uid,user.username)});
    if(action==='record_run')return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...await recordRun(user.uid,user.username,body)});
    if(action==='open_pack')return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...await openPlayerPack(user.uid,user.username,body)});
    return res.status(400).json({success:false,error:'Invalid state action'});
  }catch(error){return apiError(res,error)}
}
