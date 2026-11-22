import {createHash} from 'node:crypto';
import {readDocument,writeDocument,isConflict} from '../lib/storage.js';
import {requireAdmin} from '../lib/auth.js';
import {limitRequest} from '../lib/limits.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
async function addToIndex(entry){for(let attempt=0;attempt<5;attempt++){const old=await readDocument('contact/index.json');const entries=old?.data.entries||[];if(entries.some(e=>e.id===entry.id))return;try{await writeDocument('contact/index.json',{entries:[entry,...entries].slice(0,1000)},old?.etag);return;}catch(e){if(!isConflict(e))throw e;}}throw new HttpError(503,'Please try sending your message again.');}
function validate(body){const text=(key,min,max)=>{if(typeof body[key]!=='string')throw new HttpError(400,'Please complete all required fields.');const value=body[key].trim();if(value.length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new HttpError(400,`Please enter a valid ${key}.`);return value;};const first=text('first',1,80),last=text('last',1,80),email=text('email',3,254),topic=text('topic',1,40),message=text('message',10,5000);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Please enter a valid email address.');if(!['Product questions','Order support','Wholesale','General enquiry'].includes(topic))throw new HttpError(400,'Please choose an enquiry type.');return {first,last,email,topic,message};}
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET','POST','PUT','DELETE']))return;
 try{
  if(req.method==='POST'){
   sameOrigin(req);const body=jsonBody(req,{maxBytes:16000});await limitRequest(req,'contact',5,60*60*1000);if(body.website)return res.status(200).json({accepted:true});if(!validId(body.requestId))throw new HttpError(400,'Please refresh the form and try again.');const fields=validate(body);const fingerprint=createHash('sha256').update(JSON.stringify(fields)).digest('hex');const path=`contact/messages/${body.requestId}.json`;let old=await readDocument(path);const createdAt=new Date().toISOString();
   if(old&&old.data.fingerprint!==fingerprint)throw new HttpError(409,'Please start a new message.');
   if(!old){const data={id:body.requestId,...fields,fingerprint,createdAt,status:'unread',revision:1};try{await writeDocument(path,data);}catch(e){if(!isConflict(e))throw e;old=await readDocument(path);if(old?.data.fingerprint!==fingerprint)throw new HttpError(409,'Please start a new message.');}}
   await addToIndex({id:body.requestId,createdAt:old?.data.createdAt||createdAt});return res.status(200).json({accepted:true,reference:'TSOIE-'+body.requestId.slice(0,8).toUpperCase()});
  }
  await requireAdmin(req,res);
  if(req.method==='GET'){const page=Number(req.query?.page||0);if(!Number.isInteger(page)||page<0||page>50)throw new HttpError(400,'Invalid page.');const index=(await readDocument('contact/index.json'))?.data.entries||[];const entries=index.slice(page*20,(page+1)*20);const records=await Promise.all(entries.map(e=>readDocument(`contact/messages/${e.id}.json`)));return res.status(200).json({messages:records.filter(r=>r&&r.data.status!=='deleted').map(r=>{const {fingerprint,...message}=r.data;return message;}),hasMore:(page+1)*20<index.length,page});}
  sameOrigin(req);const body=jsonBody(req,{maxBytes:2000});if(!validId(body.id))throw new HttpError(404,'Message not found.');const path=`contact/messages/${body.id}.json`;const record=await readDocument(path);if(!record||record.data.status==='deleted')throw new HttpError(404,'Message not found.');if(body.revision!==record.data.revision)throw new HttpError(409,'This message was updated elsewhere. Refresh and try again.');let data;
  if(req.method==='DELETE')data={id:body.id,status:'deleted',revision:record.data.revision+1,createdAt:record.data.createdAt};else{if(!['read','unread'].includes(body.status))throw new HttpError(400,'Invalid message status.');data={...record.data,status:body.status,revision:record.data.revision+1};}
  try{await writeDocument(path,data,record.etag);}catch(e){if(isConflict(e))throw new HttpError(409,'This message was updated elsewhere. Refresh and try again.');throw e;}
  return res.status(200).json({ok:true});
 }catch(e){return handleError(res,e);}
}
