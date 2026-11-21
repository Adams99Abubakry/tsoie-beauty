import {stripeClient,confirmSession,expireSession} from '../lib/payments.js';
import {method} from '../lib/http.js';
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
 if(!method(req,res,['POST']))return;
 if(!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).json({error:'Webhook is not configured.'});
 let event;
 try{const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>1024*1024)return res.status(413).end();chunks.push(Buffer.from(chunk));}event=stripeClient().webhooks.constructEvent(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}catch{return res.status(400).json({error:'Invalid webhook signature.'});}
 try{
  const session=event.data.object;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))await confirmSession(session);
  else if(event.type==='checkout.session.expired')await expireSession(session,'expired');
  else if(event.type==='checkout.session.async_payment_failed')await expireSession(session,'failed');
  console.info('Stripe event processed:',event.type,event.id);return res.status(200).json({received:true});
 }catch(e){console.error('Stripe webhook processing failed:',e.name);return res.status(500).json({error:'Payment confirmation will be retried.'});}
}
