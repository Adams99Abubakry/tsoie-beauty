import {createHmac} from 'node:crypto';
import {readDocument,writeDocument,isConflict} from './storage.js';
import {HttpError} from './http.js';
export async function limitRequest(req,scope,maximum,windowMs){
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const key=createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(ip).digest('hex');const path=`security/${scope}-${key}.json`;const now=Date.now();
 for(let i=0;i<5;i++){const old=await readDocument(path);const state=old?.data.until>now?old.data:{attempts:0,until:now+windowMs};if(state.attempts>=maximum)throw new HttpError(429,'Too many requests. Please try again later.');state.attempts++;try{await writeDocument(path,state,old?.etag,{ttlDays:1});return;}catch(e){if(!isConflict(e))throw e;}}
 throw new HttpError(429,'Please wait a moment and try again.');
}
