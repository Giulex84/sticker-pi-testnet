import PiBackend from 'pi-backend';
import {verifyPiUser,apiError} from '../lib/pi.js';

const URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const PREFIX='sticker:a2u:testnet';
const LIMIT=5;
const AMOUNT=0.01;
const PiNetwork=PiBackend.default||PiBackend;

async function redis(args){
  if(!URL||!TOKEN){const e=new Error('Reward storage is unavailable');e.status=503;throw e}
  const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok){const e=new Error('Reward storage request failed');e.status=503;throw e}
  return (await r.json())?.result;
}
async function unlock(token){await redis(['EVAL',"if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",'1',`${PREFIX}:lock`,token]).catch(()=>{})}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  let lockToken='';
  try{
    const user=await verifyPiUser(req);
    if(!process.env.PI_API_KEY||!process.env.PI_WALLET_PRIVATE_SEED)return res.status(503).json({success:false,error:'Tester rewards are not configured'});
    const claimKey=`${PREFIX}:claim:${user.uid}`;
    const existingRaw=await redis(['GET',claimKey]);
    if(existingRaw){const existing=JSON.parse(existingRaw);if(existing.status==='completed')return res.status(200).json({success:true,alreadyClaimed:true,claim:existing})}
    lockToken=`${user.uid}:${Date.now()}:${Math.random()}`;
    const acquired=await redis(['SET',`${PREFIX}:lock`,lockToken,'NX','PX',120000]);
    if(acquired!=='OK')return res.status(409).json({success:false,error:'Another tester reward is being processed. Please retry shortly.'});
    const recipients=Number(await redis(['SCARD',`${PREFIX}:recipients`]))||0;
    if(recipients>=LIMIT)return res.status(409).json({success:false,closed:true,error:'All five tester rewards have been claimed.'});
    let claim=existingRaw?JSON.parse(existingRaw):{status:'pending',uid:user.uid,username:user.username,createdAt:new Date().toISOString()};
    const pi=new PiNetwork(process.env.PI_API_KEY,process.env.PI_WALLET_PRIVATE_SEED);
    if(!claim.paymentId){
      claim.paymentId=await pi.createPayment({amount:AMOUNT,memo:'Sticker.pi Testnet pioneer reward',metadata:{purpose:'mainnet_readiness_a2u',version:1},uid:user.uid});
      await redis(['SET',claimKey,JSON.stringify(claim)]);
    }
    let payment=await pi.getPayment(claim.paymentId);
    if(payment.user_uid!==user.uid||payment.direction!=='app_to_user'||payment.network!=='Pi Testnet'||Number(payment.amount)!==AMOUNT)throw Object.assign(new Error('Reward payment validation failed'),{status:400});
    if(!payment.transaction?.txid){claim.txid=await pi.submitPayment(claim.paymentId);await redis(['SET',claimKey,JSON.stringify(claim)])}
    else claim.txid=payment.transaction.txid;
    if(!payment.status?.developer_completed)payment=await pi.completePayment(claim.paymentId,claim.txid);
    payment=await pi.getPayment(claim.paymentId);
    if(!payment.status?.developer_completed||!payment.status?.transaction_verified)throw Object.assign(new Error('Reward transaction is not fully verified'),{status:409});
    claim={...claim,status:'completed',txid:payment.transaction?.txid||claim.txid,completedAt:new Date().toISOString()};
    await redis(['SET',claimKey,JSON.stringify(claim)]);
    await redis(['SADD',`${PREFIX}:recipients`,user.uid]);
    const completed=Number(await redis(['SCARD',`${PREFIX}:recipients`]))||0;
    return res.status(200).json({success:true,alreadyClaimed:false,completed,remaining:Math.max(0,LIMIT-completed),claim});
  }catch(error){return apiError(res,error)}finally{if(lockToken)await unlock(lockToken)}
}
