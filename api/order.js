import {timingSafeEqual} from 'node:crypto';
import {readOrder,accessToken,stripeClient,confirmSession} from '../lib/payments.js';
import {noCache,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET']))return;
 try{
  const token=req.query?.token;if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))throw new HttpError(404,'Order not found.');
  const record=await readOrder(req.query?.id);if(!record)throw new HttpError(404,'Order not found.');let order=record.data;
  if(!timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(accessToken(order),'hex')))throw new HttpError(404,'Order not found.');
  if(order.status==='pending'&&order.sessionId){const session=await stripeClient().checkout.sessions.retrieve(order.sessionId);order=await confirmSession(session)||order;}
  return res.status(200).json({id:order.id,number:order.number,status:order.status,live:order.live,total:order.total,shipping:order.shipping,currency:order.currency,items:order.items});
 }catch(e){return handleError(res,e);}
}
