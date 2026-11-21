import Stripe from 'stripe';
import {createHash,createHmac} from 'node:crypto';
import {readCatalog,mutateCatalog,readDocument,writeDocument,isConflict} from './storage.js';
import {HttpError} from './http.js';
export function paymentSettings(){
 const key=process.env.STRIPE_SECRET_KEY||'';const valid=/^(sk|rk)_(test|live)_/.test(key);const live=/^(sk|rk)_live_/.test(key);
 const configuredCountries=(process.env.CHECKOUT_ALLOWED_COUNTRIES||'').split(',').map(c=>c.trim().toUpperCase()).filter(Boolean);
 const countries=configuredCountries.length?configuredCountries:live?[]:['GB'];
 const rawShipping=process.env.CHECKOUT_SHIPPING_MINOR;const shipping=rawShipping===undefined||rawShipping===''?(live?null:0):Number(rawShipping);
 const missing=[];if(!valid)missing.push('STRIPE_SECRET_KEY');if(!process.env.STRIPE_WEBHOOK_SECRET)missing.push('STRIPE_WEBHOOK_SECRET');
 if(live){if(process.env.STRIPE_LIVE_ENABLED!=='true')missing.push('STRIPE_LIVE_ENABLED');if(!countries.length)missing.push('CHECKOUT_ALLOWED_COUNTRIES');if(rawShipping===undefined||rawShipping==='')missing.push('CHECKOUT_SHIPPING_MINOR');}
 if(countries.some(c=>!/^[A-Z]{2}$/.test(c)))missing.push('CHECKOUT_ALLOWED_COUNTRIES');
 if(shipping!==null&&(!Number.isSafeInteger(shipping)||shipping<0||shipping>10000000))missing.push('CHECKOUT_SHIPPING_MINOR');
 return {live,countries,shipping,missing,ready:missing.length===0};
}
export function stripeClient(){if(!/^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY||''))throw new HttpError(503,'Stripe checkout is not configured yet.');return new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:1,timeout:12000,httpClient:Stripe.createFetchHttpClient()});}
export function checkoutOrigin(){const origin=process.env.SITE_URL||'https://www.tsoiebeauty.com';const url=new URL(origin);if(url.protocol!=='https:')throw new Error('Invalid checkout origin');return url.origin;}
export function accessToken(order){return createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(`order:${order.id}:${order.fingerprint}`).digest('hex');}
export function cartFingerprint(items){return createHash('sha256').update(JSON.stringify(items.map(i=>({id:i.id,shade:i.shade,quantity:i.quantity,price:i.unitAmount})).sort((a,b)=>(a.id+':'+a.shade).localeCompare(b.id+':'+b.shade)))).digest('hex');}
export async function buildCart(input){
 if(!Array.isArray(input)||!input.length||input.length>30)throw new HttpError(400,'Please add between 1 and 30 products to your bag.');
 const {data}=await readCatalog();const combined=new Map();
 for(const line of input){
  if(!line||typeof line.id!=='string'||line.id.length>36||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>99||!Number.isInteger(line.shade)||line.shade<0||line.shade>4)throw new HttpError(400,'Your bag contains an invalid item. Please refresh it and try again.');
  const product=data.products.find(p=>p.id===line.id&&p.published);if(!product)throw new HttpError(409,'A product in your bag is no longer available.');
  if(!Number.isSafeInteger(product.price)||product.price<30)throw new HttpError(409,`The price for ${product.name} is not ready for checkout. Please contact customer care.`);
  if(product.currency!=='GBP')throw new HttpError(409,'All products in a checkout must use GBP.');
  const key=line.id+':'+line.shade;const old=combined.get(key);const quantity=(old?.quantity||0)+line.quantity;if(quantity>99)throw new HttpError(400,'A product quantity cannot exceed 99.');
  combined.set(key,{id:product.id,name:product.name,image:product.image,shade:line.shade,quantity,unitAmount:product.price,currency:'GBP'});
 }
 const items=[...combined.values()];const total=items.reduce((sum,i)=>sum+i.unitAmount*i.quantity,0);if(total>100000000)throw new HttpError(400,'Please contact customer care for this order.');return {items,subtotal:total};
}
const orderPath=id=>`orders/${id}.json`;
export function validOrderId(id){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);}
export async function readOrder(id){if(!validOrderId(id))throw new HttpError(404,'Order not found.');return readDocument(orderPath(id));}
export async function mutateOrder(id,change){
 for(let i=0;i<5;i++){const old=await readOrder(id);if(!old)throw new HttpError(404,'Order not found.');const data=structuredClone(old.data);change(data);data.updatedAt=new Date().toISOString();try{await writeDocument(orderPath(id),data,old.etag);return data;}catch(e){if(!isConflict(e))throw e;}}
 throw new HttpError(409,'The order is updating. Please try again.');
}
export async function reserveStock(order){
 await mutateCatalog(data=>{
  data.stockReservations??={};const now=Date.now();for(const [id,r] of Object.entries(data.stockReservations))if(r.expiresAt<now)delete data.stockReservations[id];
  if(data.stockReservations[order.id]||(data.paidOrderIds||[]).includes(order.id))return;
  data.orderIndex??=[];if(!data.orderIndex.some(o=>o.id===order.id)){data.orderIndex.unshift({id:order.id,createdAt:order.createdAt});data.orderIndex=data.orderIndex.slice(0,500);}
  const wanted={};for(const line of order.items)wanted[line.id]=(wanted[line.id]||0)+line.quantity;
  for(const [id,quantity] of Object.entries(wanted)){
   const p=data.products.find(p=>p.id===id&&p.published);if(!p)throw new HttpError(409,'A product is no longer available.');
   if(order.items.some(line=>line.id===id&&line.unitAmount!==p.price))throw new HttpError(409,'A product price changed. Please start checkout again.');
   if(p.stock!==null){const reserved=Object.values(data.stockReservations).reduce((n,r)=>n+(r.quantities[id]||0),0);if(p.stock-reserved<quantity)throw new HttpError(409,`There is not enough stock available for ${p.name}.`);}
  }
  data.stockReservations[order.id]={quantities:wanted,expiresAt:(order.expiresAt+600)*1000};
 });
}
export async function releaseStock(orderId){await mutateCatalog(data=>{if(data.stockReservations)delete data.stockReservations[orderId];});}
export async function createCheckout(input){
 const settings=paymentSettings();if(!settings.ready)throw new HttpError(503,'Checkout is being configured. Please try again shortly.');
 if(!validOrderId(input.requestId))throw new HttpError(400,'Please refresh your bag and try again.');
 const cart=await buildCart(input.items),fingerprint=cartFingerprint(cart.items);const now=new Date().toISOString();
 let order=(await readOrder(input.requestId))?.data;
 if(order){if(order.fingerprint!==fingerprint||order.live!==settings.live)throw new HttpError(409,'Your bag or its prices have changed. Please start checkout again.');}
 else{
  order={id:input.requestId,number:'TSOIE-'+input.requestId.slice(0,8).toUpperCase(),fingerprint,items:cart.items,subtotal:cart.subtotal,shipping:settings.shipping,total:cart.subtotal+settings.shipping,currency:'GBP',live:settings.live,status:'pending',createdAt:now,updatedAt:now,expiresAt:Math.floor(Date.now()/1000)+3600,sessionId:null};
  try{await writeDocument(orderPath(order.id),order);}catch(e){if(!isConflict(e))throw e;order=(await readOrder(order.id)).data;if(order.fingerprint!==fingerprint)throw new HttpError(409,'Your bag changed. Please start checkout again.');}
 }
 const stripe=stripeClient(),token=accessToken(order),origin=checkoutOrigin();const returnUrl=`${origin}/#/checkout-success?order=${order.id}&token=${token}`;
 if(order.status==='paid')return {url:returnUrl,live:order.live};
 if(order.expiresAt<=Math.floor(Date.now()/1000))throw new HttpError(409,'This checkout has expired. Please start a new checkout.');
 if(order.sessionId){const existing=await stripe.checkout.sessions.retrieve(order.sessionId);if(existing.status==='complete')return {url:returnUrl,live:order.live};if(existing.status==='open'&&existing.url)return {url:existing.url,live:order.live};throw new HttpError(409,'This checkout has expired. Please start a new checkout.');}
 await reserveStock(order);
 const session=await stripe.checkout.sessions.create({
  mode:'payment',adaptive_pricing:{enabled:false},client_reference_id:order.id,metadata:{orderId:order.id},
  line_items:order.items.map(i=>({quantity:i.quantity,price_data:{currency:'gbp',unit_amount:i.unitAmount,product_data:{name:i.name,description:`Shade: Sample ${i.shade+1}`,metadata:{productId:i.id,shade:String(i.shade)}}}})),
  shipping_address_collection:{allowed_countries:settings.countries},shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:order.shipping,currency:'gbp'},display_name:settings.live?'Standard delivery':'Test delivery — no real shipment'}}],
  success_url:returnUrl,cancel_url:`${origin}/#/bag?checkout=cancelled`,expires_at:order.expiresAt
 },{idempotencyKey:`tsoie-checkout-${order.id}`});
 await mutateOrder(order.id,data=>{data.sessionId=session.id;});return {url:session.url,live:order.live};
}
export async function confirmSession(session){
 const id=session.metadata?.orderId;if(!validOrderId(id))return null;const record=await readOrder(id);if(!record)return null;const order=record.data;
 if(order.sessionId&&order.sessionId!==session.id)throw new Error('Stripe session mismatch');
 if(Boolean(session.livemode)!==order.live)throw new Error('Stripe mode mismatch');
 if(session.payment_status!=='paid'){if(session.status==='complete')await mutateCatalog(data=>{if(data.stockReservations?.[order.id])data.stockReservations[order.id].expiresAt=Date.now()+7*24*60*60*1000;});return order;}
 if(session.currency!=='gbp'||session.amount_total!==order.total)throw new Error('Stripe total mismatch');
 await mutateCatalog(data=>{
  data.paidOrderIds??=[];if(data.paidOrderIds.includes(order.id))return;
  const quantities={};for(const item of order.items)quantities[item.id]=(quantities[item.id]||0)+item.quantity;
  for(const [id,quantity] of Object.entries(quantities)){const p=data.products.find(p=>p.id===id);if(p&&p.stock!==null){p.stock=Math.max(0,p.stock-quantity);p.revision++;p.updatedAt=new Date().toISOString();}}
  if(data.stockReservations)delete data.stockReservations[order.id];data.paidOrderIds.push(order.id);
 });
 return mutateOrder(order.id,data=>{if(data.status==='paid')return;data.status='paid';data.sessionId=session.id;data.paidAt=new Date().toISOString();data.fulfillmentStatus='unfulfilled';data.customer={name:session.customer_details?.name||'',email:session.customer_details?.email||'',shipping:session.collected_information?.shipping_details||session.shipping_details||null};data.paymentIntentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null;});
}
export async function expireSession(session,status){const id=session.metadata?.orderId;if(!validOrderId(id))return;const old=await readOrder(id);if(!old||old.data.status==='paid')return;if((old.data.sessionId&&old.data.sessionId!==session.id)||old.data.live!==Boolean(session.livemode))throw new Error('Stripe session mismatch');await mutateOrder(id,data=>{if(data.status!=='paid')data.status=status;});await releaseStock(id);}
export async function checkoutLimit(req){
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
 const key=createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(ip).digest('hex');const path=`security/checkout-${key}.json`;const now=Date.now();
 for(let i=0;i<5;i++){const old=await readDocument(path);const value=old?.data.until>now?old.data:{attempts:0,until:now+15*60*1000};if(value.attempts>=20)throw new HttpError(429,'Too many checkout requests. Please try again later.');value.attempts++;try{await writeDocument(path,value,old?.etag);return;}catch(e){if(!isConflict(e))throw e;}}
 throw new HttpError(429,'Please wait a moment and try again.');
}
