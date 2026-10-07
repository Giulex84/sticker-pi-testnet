import {verifyPiUser,apiError} from '../lib/pi.js';
import {getPlayer,startRun,recordRun,openPlayerPack,claimAlbumReward,getDailyLeaderboard,rateLimit,storageEnabled,serverDay,conversionCatalog,quoteDuplicateConversion,convertDuplicates,selectPlayerAlbum} from '../lib/store.js';
import {safeRecordMetric} from '../lib/metrics.js';
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
    const user=await verifyPiUser(req),body=req.body||{},action=req.method==='GET'?'load':body.action||'load';
    await rateLimit(user.uid,action,action==='load'?60:12,60);
    if(action==='load')return res.status(200).json({success:true,storage:storageEnabled(),serverDay:serverDay(),player:await getPlayer(user.uid,user.username)});
    if(action==='select_album'){const result=await selectPlayerAlbum(user.uid,user.username,body.albumId);return res.status(200).json({success:true,storage:true,...result})}
    if(action==='conversion_options'){const player=await getPlayer(user.uid,user.username);return res.status(200).json({success:true,storage:true,player,conversion:conversionCatalog(player)})}
    if(action==='conversion_quote'){const player=await getPlayer(user.uid,user.username);return res.status(200).json({success:true,storage:true,player,...quoteDuplicateConversion(player,body.target)})}
    if(action==='convert_duplicates'){const result=await convertDuplicates(user.uid,user.username,body);if(!result.alreadyConverted){await safeRecordMetric(user.uid,'duplicates_converted',body.conversionId);if(result.albumCompleted)await safeRecordMetric(user.uid,'album_completed',`album-${result.albumId||result.player.activeAlbum||1}`)}return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...result})}
    if(action==='daily_leaderboard')return res.status(200).json({success:true,storage:true,...await getDailyLeaderboard(user.uid,serverDay())});
    if(!storageEnabled())return res.status(503).json({success:false,error:'Cloud storage is required for this action'});
    if(action==='start_run'){const result=await startRun(user.uid,user.username);await safeRecordMetric(user.uid,'run_started',result.runId,result.day);return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...result})}
    if(action==='record_run'){const result=await recordRun(user.uid,user.username,body);if(!result.alreadyRecorded){await safeRecordMetric(user.uid,'run_completed',body.runId,result.day||result.player.daily.date);if(result.xpPacksGranted)await safeRecordMetric(user.uid,'xp_pack_earned',body.runId,result.day||result.player.daily.date);if(result.player.daily.runsCompleted===1)await safeRecordMetric(user.uid,'player_first_run',result.player.daily.date,result.player.daily.date);if(result.player.daily.runsCompleted===2)await safeRecordMetric(user.uid,'player_repeat_run',result.player.daily.date,result.player.daily.date);}return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...result})}
    if(action==='open_pack'){const result=await openPlayerPack(user.uid,user.username,body);if(!result.alreadyOpened)await safeRecordMetric(user.uid,'pack_opened',body.openId);if(result.albumCompleted)await safeRecordMetric(user.uid,'album_completed',`album-${result.albumId||result.player.activeAlbum||1}`);return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...result})}
    if(action==='claim_album_reward'){const result=await claimAlbumReward(user.uid,user.username);if(result.albumCompleted)await safeRecordMetric(user.uid,'album_completed',`album-${result.albumId||result.player.activeAlbum||1}`);return res.status(200).json({success:true,storage:true,serverDay:serverDay(),...result})}
    return res.status(400).json({success:false,error:'Invalid state action'});
  }catch(error){return apiError(res,error)}
}
