import PiBackend from 'pi-backend';
import {createHash,randomUUID} from 'node:crypto';
import {verifyPiUser,apiError} from '../lib/pi.js';

const URL=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const TOKEN=process.env.UPSTASH_REDIS_REST_TOKEN||'';
const PREFIX='sticker:a2u:testnet';
const LIMIT=5;
const AMOUNT=0.01;
const PiNetwork=PiBackend.default||PiBackend;
const walletKey=`${PREFIX}:wallets`;
const paymentsKey=`${PREFIX}:payments`;

async function redis(args){
  if(!URL||!TOKEN)throw Object.assign(new Error('Reward storage is unavailable'),{status:503});
  const r=await fetch(URL,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok)throw Object.assign(new Error('Reward storage request failed'),{status:503});
  const data=await r.json();
  if(data.error)throw Object.assign(new Error('Reward storage command failed'),{status:503});
  return data.result;
}
function validatePayment(payment,uid){
  if(!payment.identifier||payment.user_uid!==uid||payment.direction!=='app_to_user'||payment.network!=='Pi Testnet'||Number(payment.amount)!==AMOUNT||payment.status?.cancelled||payment.status?.user_cancelled)
    throw Object.assign(new Error('Reward payment validation failed'),{status:400});
}
function completedPayment(payment){return Boolean(payment.status?.developer_completed&&payment.status?.transaction_verified&&payment.transaction?.txid);}
function walletHash(payment){
  if(!/^G[A-Z2-7]{55}$/.test(payment.to_address||''))throw Object.assign(new Error('Pi has not confirmed a valid recipient wallet'),{status:409});
  return createHash('sha256').update(`sticker:testnet:${payment.to_address}`).digest('hex');
}
async function recordVerified(payment,uid){
  validatePayment(payment,uid);
  if(!completedPayment(payment))throw Object.assign(new Error('Reward transaction is not fully verified'),{status:409});
  const hash=walletHash(payment);
  await redis(['EVAL',"redis.call('SADD',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],ARGV[2]); redis.call('SADD',KEYS[3],ARGV[3]); return 1",3,walletKey,paymentsKey,`${PREFIX}:recipients`,hash,payment.identifier,uid]);
  return hash;
}
async function metrics(){
  const [wallets,payments]=await Promise.all([redis(['SCARD',walletKey]),redis(['SCARD',paymentsKey])]);
  const completed=Number(wallets)||0;
  return {completed,verifiedPayments:Number(payments)||0,limit:LIMIT,remaining:Math.max(0,LIMIT-completed),thresholdReached:completed>=LIMIT};
}
async function renew(token){
  const ok=await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end",1,`${PREFIX}:lock`,token,120000]);
  if(!ok)throw Object.assign(new Error('Test payment lock expired. Retry to recover your payment.'),{status:409});
}
async function unlock(token){await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,`${PREFIX}:lock`,token]).catch(()=>{});}
async function reconcileLegacy(pi,token){
  const ids=await redis(['SMEMBERS',`${PREFIX}:recipients`])||[];
  for(const uid of ids){
    const raw=await redis(['GET',`${PREFIX}:claim:${uid}`]);
    const claim=raw?JSON.parse(raw):null;
    if(!claim?.paymentId||claim.walletHash)continue;
    await renew(token);
    const payment=await pi.getPayment(claim.paymentId);
    const hash=await recordVerified(payment,uid);
    await redis(['SET',`${PREFIX}:claim:${uid}`,JSON.stringify({...claim,walletHash:hash})]);
  }
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'});}
  let lockToken='';
  try{
    const user=await verifyPiUser(req);
    const action=req.body?.action||'claim';
    if(!['claim','status'].includes(action))return res.status(400).json({success:false,error:'Invalid test action'});
    const apiKey=(process.env.PI_API_KEY||'').trim(),walletSeed=(process.env.PI_WALLET_PRIVATE_SEED||'').trim();
    if(!apiKey||!walletSeed)return res.status(503).json({success:false,error:'Tester rewards are not configured'});
    lockToken=randomUUID();
    if(await redis(['SET',`${PREFIX}:lock`,lockToken,'NX','PX',120000])!=='OK')return res.status(409).json({success:false,error:'Another tester reward is being processed. Please retry shortly.'});
    const pi=new PiNetwork(apiKey,walletSeed);
    await reconcileLegacy(pi,lockToken);
    const claimKey=`${PREFIX}:claim:${user.uid}`;
    const raw=await redis(['GET',claimKey]);
    let claim=raw?JSON.parse(raw):{status:'pending',uid:user.uid,createdAt:new Date().toISOString()};
    const admin=user.username.toLowerCase()===(process.env.STICKER_ADMIN_USERNAME||'Giulex84').toLowerCase();
    if(action==='status'){
      const m=await metrics();
      return res.status(200).json({success:true,...m,alreadyClaimed:claim.status==='completed',admin});
    }
    if(claim.status==='completed')return res.status(200).json({success:true,alreadyClaimed:true,...await metrics()});
    const before=await metrics();
    // Recover existing payments even if the five-wallet threshold has since been reached.
    if(before.thresholdReached&&!claim.paymentId)return res.status(409).json({success:false,closed:true,...before,error:'The five-wallet Test-Pi test is complete.'});
    if(!claim.paymentId){
      await renew(lockToken);
      claim.paymentId=await pi.createPayment({amount:AMOUNT,memo:'Sticker.pi Testnet pioneer reward',metadata:{purpose:'mainnet_readiness_a2u',version:1},uid:user.uid});
      await redis(['SET',claimKey,JSON.stringify(claim)]);
    }
    await renew(lockToken);
    let payment=await pi.getPayment(claim.paymentId);
    validatePayment(payment,user.uid);
    const hash=walletHash(payment);
    if(!payment.transaction?.txid&&!claim.txid){
      if(await redis(['SISMEMBER',walletKey,hash])){
        return res.status(409).json({success:false,error:'This Testnet wallet has already received a test payment.'});
      }
      if((await metrics()).thresholdReached)return res.status(409).json({success:false,closed:true,error:'The five-wallet Test-Pi test is complete.'});
      await renew(lockToken);
      claim.txid=await pi.submitPayment(claim.paymentId);
      await redis(['SET',claimKey,JSON.stringify(claim)]);
    }else claim.txid=payment.transaction?.txid||claim.txid;
    if(!payment.status?.developer_completed){
      await renew(lockToken);
      await pi.completePayment(claim.paymentId,claim.txid);
    }
    payment=await pi.getPayment(claim.paymentId);
    await renew(lockToken);
    const confirmedHash=await recordVerified(payment,user.uid);
    claim={...claim,status:'completed',walletHash:confirmedHash,txid:payment.transaction.txid,completedAt:new Date().toISOString()};
    await redis(['SET',claimKey,JSON.stringify(claim)]);
    return res.status(200).json({success:true,alreadyClaimed:false,...await metrics()});
  }catch(error){return apiError(res,error);}finally{if(lockToken)await unlock(lockToken);}
}
