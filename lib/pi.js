const PI_API_BASE='https://api.minepi.com/v2';
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7).trim():null}
export async function verifyPiUser(req){const token=bearer(req);if(!token){const e=new Error('Missing Pi access token');e.status=401;throw e}const r=await fetch(`${PI_API_BASE}/me`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok){const e=new Error('Invalid or expired Pi session');e.status=401;throw e}const user=await r.json();if(!user?.uid||!user?.username){const e=new Error('Pi identity response is incomplete');e.status=401;throw e}return user}
export function apiError(res,error){const status=Number(error?.status)||500;return res.status(status).json({success:false,error:status>=500?'Server error':error.message})}
