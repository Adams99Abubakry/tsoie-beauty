import {requireAdmin,passwordMatches,hashPassword,accountVersion,loginLimit,readAccount,credentialPath} from '../lib/auth.js';
import {writeDocument,isConflict} from '../lib/storage.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
  noCache(res);if(!method(req,res,['POST']))return;
  try{
    sameOrigin(req);const session=await requireAdmin(req,res);const body=jsonBody(req);
    if(typeof body.newPassword!=='string'||body.newPassword.length<12||body.newPassword.length>256)throw new HttpError(400,'Your new password must be between 12 and 256 characters.');
    await loginLimit(req);
    const account=await readAccount();
    if(session.accountVersion!==accountVersion(account.data.passwordHash))throw new HttpError(409,'Your password was changed elsewhere. Please sign in again.');
    if(!await passwordMatches(body.currentPassword,account.data.passwordHash))throw new HttpError(400,'Your current password is incorrect.');
    if(body.currentPassword===body.newPassword)throw new HttpError(400,'Choose a new password different from your current password.');
    const passwordHash=await hashPassword(body.newPassword);
    try{await writeDocument(credentialPath,{...account.data,passwordHash,updatedAt:new Date().toISOString()},account.etag);}catch(e){if(isConflict(e))throw new HttpError(409,'Your password was changed elsewhere. Please sign in again.');throw e;}
    session.destroy();return res.status(200).json({ok:true,message:'Password changed. Please sign in with your new password.'});
  }catch(e){return handleError(res,e);}
}
