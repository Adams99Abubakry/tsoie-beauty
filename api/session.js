import {session,requireAdmin,passwordMatches,accountVersion,loginLimit,readAccount} from '../lib/auth.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
  noCache(res);if(!method(req,res,['GET','POST','DELETE']))return;
  try{
    if(req.method==='GET'){const s=await requireAdmin(req,res);return res.status(200).json({email:s.email});}
    sameOrigin(req);
    if(req.method==='DELETE'){const s=await session(req,res);s.destroy();return res.status(200).json({ok:true});}
    const body=jsonBody(req);await loginLimit(req);
    const {data:account}=await readAccount();
    const passwordOK=await passwordMatches(body.password,account.passwordHash);
    if(typeof body.email!=='string'||body.email.trim().toLowerCase()!==process.env.ADMIN_EMAIL||!passwordOK)throw new HttpError(401,'Email or password is incorrect.');
    const s=await session(req,res);s.email=process.env.ADMIN_EMAIL;s.accountVersion=accountVersion(account.passwordHash);await s.save();
    return res.status(200).json({email:s.email});
  }catch(e){return handleError(res,e);}
}
