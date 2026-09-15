import {verifyPiUser,apiError} from '../lib/pi.js';
export default async function handler(req,res){if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'})}try{const user=await verifyPiUser(req);return res.status(200).json({success:true,user:{uid:user.uid,username:user.username}})}catch(error){return apiError(res,error)}}
