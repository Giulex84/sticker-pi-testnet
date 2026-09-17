import {verifyPiUser,apiError} from '../lib/pi.js';
import {grantPaidPack,rateLimit} from '../lib/store.js';

const PI_API_BASE='https://api.minepi.com/v2';
const AMOUNT=0.01;
const PRODUCT='sticker_bonus_pack_testnet_v1';
const MEMO='Sticker.pi Bonus Pack';

async function piFailure(r,stage){
  const text=await r.text();
  let detail='';
  try{const data=JSON.parse(text);detail=data?.error_message||data?.error||''}catch{detail=text}
  const e=new Error(`${stage} failed (${r.status})${detail?`: ${String(detail).slice(0,180)}`:''}`);
  e.status=r.status;
  throw e;
}
async function getPayment(id,key){
  const r=await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(id)}`,{headers:{Authorization:`Key ${key}`},cache:'no-store'});
  if(!r.ok)await piFailure(r,'Pi payment lookup');
  return r.json();
}

function validPayment(p,uid){
  return p?.user_uid===uid&&p.direction==='user_to_app'&&p.network==='Pi Testnet'&&Number(p.amount)===AMOUNT&&p.memo===MEMO&&p.metadata?.product===PRODUCT&&!p.status?.cancelled&&!p.status?.user_cancelled;
}

async function approve(id,key){
  const r=await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(id)}/approve`,{method:'POST',headers:{Authorization:`Key ${key}`}});
  if(!r.ok){const clone=r.clone(),t=await clone.text();if(!t.includes('already_approved'))await piFailure(r,'Pi payment approval')}
}

async function cancel(id,key){
  const r=await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(id)}/cancel`,{method:'POST',headers:{Authorization:`Key ${key}`}});
  if(!r.ok){const t=await r.text();if(!/already_(cancelled|completed)/i.test(t)){const e=new Error('Incomplete payment cancellation failed');e.status=r.status;throw e}}
}

async function complete(id,txid,key){
  const r=await fetch(`${PI_API_BASE}/payments/${encodeURIComponent(id)}/complete`,{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({txid})});
  if(!r.ok){const t=await r.text();if(!t.includes('already_completed')){const e=new Error('Payment completion failed');e.status=r.status;throw e}}
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
    const user=await verifyPiUser(req);
    await rateLimit(user.uid,'payment',20,60);
    const body=req.body||{};
    if(!body.action)return res.status(200).json({success:true,user:{uid:user.uid,username:user.username}});
    const apiKey=(process.env.PI_API_KEY||'').trim();
    if(!apiKey)return res.status(503).json({success:false,error:'Payment service unavailable'});
    const {action,paymentId,txid}=body;
    if(!['approve','complete','recover'].includes(action)||!paymentId)return res.status(400).json({success:false,error:'Invalid payment request'});
    let p=await getPayment(paymentId,apiKey);
    if(!validPayment(p,user.uid))return res.status(400).json({success:false,error:'Payment validation failed'});
    if(action==='approve'){
      if(!p.status?.developer_approved)await approve(paymentId,apiKey);
      return res.status(200).json({success:true,approved:true});
    }
    const realTxid=txid||p.transaction?.txid;
    if(action==='recover'&&!realTxid){
      await cancel(paymentId,apiKey);
      return res.status(200).json({success:true,cancelled:true,completed:false});
    }
    if(!realTxid)return res.status(409).json({success:false,pending:true,error:'Payment is waiting for a blockchain transaction'});
    if(p.transaction?.txid&&p.transaction.txid!==realTxid)return res.status(409).json({success:false,error:'Transaction mismatch'});
    if(!p.status?.developer_completed)await complete(paymentId,realTxid,apiKey);
    p=await getPayment(paymentId,apiKey);
    if(!validPayment(p,user.uid)||!p.status?.developer_completed||!p.status?.transaction_verified)return res.status(409).json({success:false,pending:true,error:'Payment not fully verified yet'});
    const grant=await grantPaidPack(user.uid,user.username,paymentId);
    return res.status(200).json({success:true,completed:true,product:PRODUCT,paymentId,player:grant.player,alreadyGranted:grant.alreadyGranted});
  }catch(error){
    const status=Number(error?.status);
    const safeStatus=Number.isFinite(status)&&status>=400&&status<500?status:502;
    return res.status(safeStatus).json({success:false,error:error?.message||'Payment service error'});
  }
}
