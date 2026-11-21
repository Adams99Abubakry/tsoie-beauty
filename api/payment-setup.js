// Temporary deployment bootstrap. Removed after Stripe webhook credentials are saved.
import {timingSafeEqual,createHash} from 'node:crypto';
import Stripe from 'stripe';
import {readDocument,writeDocument} from '../lib/storage.js';
import {checkoutOrigin} from '../lib/payments.js';
import {noCache,sameOrigin,method,handleError,HttpError} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['POST']))return;
 let stage='authorise';
 try{
  sameOrigin(req);const supplied=req.headers['x-payment-setup-token'];const expected=process.env.PAYMENT_SETUP_TOKEN;
  if(typeof supplied!=='string'||!expected||supplied.length!==expected.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new HttpError(404,'Not found.');
  if(!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY||''))throw new HttpError(400,'A Stripe test secret key is required. Live keys are not used by this setup.');
  const previous=await readDocument('security/stripe-webhook-bootstrap.json');if(previous)return res.status(200).json({configured:true,endpoint:previous.data.endpointId,test:true});
  stage='validate-test-key';const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:1,timeout:12000});await stripe.balance.retrieve();
  const url=checkoutOrigin()+'/api/stripe-webhook';
  stage='create-webhook';const endpoint=await stripe.webhookEndpoints.create({url,enabled_events:['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'],description:'TSOIE Beauty checkout payment confirmations'},{idempotencyKey:'tsoie-webhook-'+createHash('sha256').update(url).digest('hex')});
  stage='save-signing-secret';if(!endpoint.secret)throw new Error('Webhook signing secret missing');
  await writeDocument('security/stripe-webhook-bootstrap.json',{endpointId:endpoint.id,secret:endpoint.secret,url,test:true});
  return res.status(200).json({configured:true,endpoint:endpoint.id,test:true});
 }catch(e){return res.status(e.status||503).json({error:'Stripe setup could not complete.',stage,type:e.type||e.name,code:e.code||null,status:e.statusCode||null});}
}
