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
async function incompletePayments(apiKey){
  const r=await fetch('https://api.minepi.com/v2/payments/incomplete_server_payments',{headers:{Authorization:`Key ${apiKey}`},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Object.assign(new Error('Pi payment recovery is temporarily unavailable. No new payment was created.'),{status:409});
  const data=await r.json();
  if(!Array.isArray(data.incomplete_server_payments))throw Object.assign(new Error('Pi recovery response is incomplete.'),{status:409});
  return data.incomplete_server_payments;
}
async function createTestPayment(apiKey,uid){
  let r;
  try{
    r=await fetch('https://api.minepi.com/v2/payments',{method:'POST',headers:{Authorization:`Key ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({payment:{amount:AMOUNT,memo:'Sticker.pi Testnet pioneer reward',metadata:{purpose:'mainnet_readiness_a2u',version:1},uid}}),signal:AbortSignal.timeout(20000)});
  }catch(error){
    throw Object.assign(new Error('Pi create request did not return a response'),{code:error?.name==='TimeoutError'?'pi_timeout':'pi_network_error'});
  }
  let data;
  try{data=await r.json();}catch{throw Object.assign(new Error('Pi returned a non-JSON create response'),{code:'pi_invalid_response',httpStatus:r.status});}
  if(!r.ok){
    const raw=typeof data?.error==='string'?data.error:'';
    const code=/^[a-z][a-z0-9_]{0,63}$/.test(raw)?raw:(r.status===401?'unauthorized':r.status===403?'forbidden':r.status===429?'pi_rate_limited':'pi_http_error');
    throw Object.assign(new Error('Pi rejected payment creation'),{code,httpStatus:r.status});
  }
  if(!data?.identifier)throw Object.assign(new Error('Pi create response lacks identifier'),{code:'pi_invalid_response',httpStatus:r.status});
  return data.identifier;
}
function pending(message){return Object.assign(new Error(message),{status:409,pending:true});}
function matchesTest(p){return p?.direction==='app_to_user'&&p.network==='Pi Testnet'&&Number(p.amount)===AMOUNT&&p.memo==='Sticker.pi Testnet pioneer reward'&&p.metadata?.purpose==='mainnet_readiness_a2u';}
async function metrics(){
  const [wallets,payments]=await Promise.all([redis(['SCARD',walletKey]),redis(['SCARD',paymentsKey])]);
  const completed=Number(wallets)||0;
  return {completed,verifiedPayments:Number(payments)||0,limit:LIMIT,remaining:Math.max(0,LIMIT-completed),thresholdReached:completed>=LIMIT};
}
async function renew(token){
  const ok=await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],ARGV[2]) else return 0 end",1,`${PREFIX}:lock`,token,120000]);
  if(!ok)throw Object.assign(new Error('Test payment lock expired. Retry to recover your payment.'),{status:409});
}
async function releaseActive(uid){await redis(['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,`${PREFIX}:active`,uid]);}
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
      return res.status(200).json({success:true,...m,alreadyClaimed:claim.status==='completed',pending:Boolean(claim.paymentId&&!['completed','blocked'].includes(claim.status))||['creating','submitting'].includes(claim.status),admin});
    }
    if(claim.status==='completed'){await releaseActive(user.uid);return res.status(200).json({success:true,alreadyClaimed:true,...await metrics()});}
    const activeUid=await redis(['GET',`${PREFIX}:active`]);
    if(activeUid&&activeUid!==user.uid)throw pending('Another tester has an unresolved payment. They must recover it before a new test can start.');
    const before=await metrics();
    // Recover existing payments even if the five-wallet threshold has since been reached.
    if(before.thresholdReached&&!claim.paymentId)return res.status(409).json({success:false,closed:true,...before,error:'The five-wallet Test-Pi test is complete.'});
    if(!claim.paymentId){
      // Pi is the source of truth if creation succeeded but the response or Redis write was lost.
      await renew(lockToken);
      const ongoing=await incompletePayments(apiKey);
      const own=ongoing.filter(p=>matchesTest(p)&&p.user_uid===user.uid);
      if(own.length>1)throw pending('Multiple pending test payments need administrator review. No new payment was created.');
      if(own.length===1){
        claim={...claim,paymentId:own[0].identifier,status:'pending'};
        await redis(['SET',claimKey,JSON.stringify(claim)]);
      }else{
        // No submission can start while the durable claim is still in creating.
        // A successful Pi incomplete-payments lookup plus Pi's ongoing-payment guard
        // allows retrying creation; submitting states never follow this path.
        if(ongoing.length)throw pending('An app payment is still ongoing. Its recipient must recover it before a new test can start.');
        // Persist intent before the external side effect; never blindly repeat an uncertain creation.
        await redis(['SET',`${PREFIX}:active`,user.uid]);
        claim={...claim,status:'creating',createdAt:claim.createdAt||new Date().toISOString()};
        await redis(['SET',claimKey,JSON.stringify(claim)]);
        await renew(lockToken);
        try{
          claim.paymentId=await createTestPayment(apiKey,user.uid);
          claim.status='pending';
          await redis(['SET',claimKey,JSON.stringify(claim)]);
        }catch(error){
          const allowedCodes=['altered_amount','invalid_address','missing_scope','missing_wallet','ongoing_payment_found','feature_not_available','too_many_cancelled_payments','too_many_payments','user_not_found','invalid_amount','invalid_arguments','invalid_metadata','payment_not_found','unauthorized','forbidden','pi_timeout','pi_network_error','pi_invalid_response','pi_rate_limited','pi_http_error'];
          const code=allowedCodes.includes(error?.code)?error.code:'unknown_error';
          console.warn(JSON.stringify({event:'sticker_a2u_create_failed',stage:'create',code,httpStatus:error?.httpStatus||null}));
          claim.lastCreateError=code;
          await redis(['SET',claimKey,JSON.stringify(claim)]);
          const recovered=(await incompletePayments(apiKey)).filter(p=>matchesTest(p)&&p.user_uid===user.uid);
          if(recovered.length!==1){
            const messages={
              unauthorized:'Pi rejected the Testnet API key. Verify the API key of the paired Testnet app in Vercel.',
              forbidden:'Pi denied A2U creation for this Testnet app. Check its authorization in Developer Portal.',
              pi_timeout:'Pi did not respond in time. Retry recovery later.',
              pi_network_error:'The server could not reach Pi for creation. Retry recovery later.',
              pi_rate_limited:'Pi is limiting requests. Wait before retrying.',
              pi_http_error:'Pi returned an HTTP error during creation. Administrator diagnosis required.',
              pi_invalid_response:'Pi returned an incomplete response. Retry recovery later.',
              missing_wallet:'Pi reports no recipient wallet. Activate your Testnet wallet in Pi Wallet.',
              missing_scope:'Pi requires wallet-address permission for A2U. Reload, sign in again and authorize your public wallet address.',
              feature_not_available:'Pi has not enabled A2U for this Testnet app. Check its Developer Portal authorization.',
              invalid_address:'Pi rejected the recipient wallet address.',
              user_not_found:'Pi did not recognize this user for the paired Testnet app.',
              too_many_payments:'Pi payment limit reached. Retry later.',
              too_many_cancelled_payments:'Pi cancelled-payment limit reached. Administrator review required.'
            };
            if(!['unknown_error','ongoing_payment_found','pi_timeout','pi_network_error','pi_invalid_response','pi_http_error'].includes(code)){
              claim.status='create_rejected';await redis(['SET',claimKey,JSON.stringify(claim)]);await releaseActive(user.uid);
            }
            throw pending((messages[code]||'Pi creation could not finish. Retry recovery; no transfer has been submitted.')+' [Pi: '+code+']');
          }
          claim={...claim,paymentId:recovered[0].identifier,status:'pending'};
          await redis(['SET',claimKey,JSON.stringify(claim)]);
        }
      }
    }
    await redis(['SET',`${PREFIX}:active`,user.uid]);
    await renew(lockToken);
    let payment=await pi.getPayment(claim.paymentId);
    if((payment.status?.cancelled||payment.status?.user_cancelled)&&!payment.transaction?.txid&&!claim.txid&&claim.status!=='submitting'&&payment.user_uid===user.uid&&matchesTest(payment)){
      claim.status='blocked';await redis(['SET',claimKey,JSON.stringify(claim)]);await releaseActive(user.uid);
      throw pending('This test payment was cancelled. Administrator review is needed before another attempt.');
    }
    validatePayment(payment,user.uid);
    if(!matchesTest(payment))throw pending('Pending payment does not belong to this test. Administrator review required.');
    const hash=walletHash(payment);
    if(!payment.transaction?.txid&&!claim.txid){
      if(claim.status!=='submitting'&&await redis(['SISMEMBER',walletKey,hash])){
        await renew(lockToken);
        await pi.cancelPayment(claim.paymentId);
        claim.status='blocked';
        await redis(['SET',claimKey,JSON.stringify(claim)]);
        await releaseActive(user.uid);
        return res.status(409).json({success:false,error:'This Testnet wallet has already received a test payment.'});
      }
      if(claim.status!=='submitting'&&(await metrics()).thresholdReached){
        await renew(lockToken);
        await pi.cancelPayment(claim.paymentId);
        claim.status='blocked';
        await redis(['SET',claimKey,JSON.stringify(claim)]);
        return res.status(409).json({success:false,closed:true,error:'The five-wallet Test-Pi test is complete.'});
      }
      if(claim.status==='submitting')throw pending('Blockchain submission has an uncertain outcome. Retry recovery later; no second transfer will be sent.');
      await renew(lockToken);
      claim.status='submitting';
      await redis(['SET',claimKey,JSON.stringify(claim)]);
      try{claim.txid=await pi.submitPayment(claim.paymentId);}
      catch(error){
        const observed=await pi.getPayment(claim.paymentId);
        validatePayment(observed,user.uid);
        if(!observed.transaction?.txid)throw pending('Pi has not confirmed the transaction yet. Retry recovery; no second transfer will be sent.');
        claim.txid=observed.transaction.txid;
      }
      claim.status='submitted';
      await redis(['SET',claimKey,JSON.stringify(claim)]);
    }else claim.txid=payment.transaction?.txid||claim.txid;
    if(!payment.status?.developer_completed){
      await renew(lockToken);
      try{await pi.completePayment(claim.paymentId,claim.txid);}
      catch(error){const observed=await pi.getPayment(claim.paymentId);validatePayment(observed,user.uid);if(!completedPayment(observed))throw pending('Transaction sent; Pi completion is pending. Retry recovery without sending again.');}
    }
    payment=await pi.getPayment(claim.paymentId);
    await renew(lockToken);
    const confirmedHash=await recordVerified(payment,user.uid);
    claim={...claim,status:'completed',walletHash:confirmedHash,txid:payment.transaction.txid,completedAt:new Date().toISOString()};
    await redis(['SET',claimKey,JSON.stringify(claim)]);
    await releaseActive(user.uid);
    return res.status(200).json({success:true,alreadyClaimed:false,...await metrics()});
  }catch(error){if(error.pending)return res.status(409).json({success:false,pending:true,error:error.message});return apiError(res,error);}finally{if(lockToken)await unlock(lockToken);}
}
