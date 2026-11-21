import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import RealStripe from 'stripe';
const objects=new Map(),sessions=new Map();let serial=0,sessionCreates=0,lastParams;
class BlobNotFoundError extends Error{}class BlobPreconditionFailedError extends Error{}
mock.module('@vercel/blob',{namedExports:{BlobNotFoundError,BlobPreconditionFailedError,
 get:async key=>{const o=objects.get(key);return o?{blob:{etag:'W/'+o.etag},stream:new ReadableStream({start(c){c.enqueue(o.bytes);c.close();}})}:null;},
 put:async(key,body,options)=>{const old=objects.get(key);if((options.ifMatch&&old?.etag!==options.ifMatch)||(!options.ifMatch&&old&&!options.allowOverwrite))throw new BlobPreconditionFailedError();const etag='"'+(++serial)+'"';objects.set(key,{etag,bytes:Buffer.from(body)});return {etag};}
}});
class TestStripe extends RealStripe{constructor(...args){super(...args);this.checkout={sessions:{create:async(params)=>{lastParams=params;sessionCreates++;const session={id:'cs_test_'+sessionCreates,url:'https://checkout.stripe.com/c/pay/test_'+sessionCreates,status:'open',payment_status:'unpaid',livemode:false,currency:'gbp',amount_total:params.line_items.reduce((sum,i)=>sum+i.price_data.unit_amount*i.quantity,0)+params.shipping_options[0].shipping_rate_data.fixed_amount.amount,metadata:params.metadata};sessions.set(session.id,session);return session;},retrieve:async id=>structuredClone(sessions.get(id))}};}}
mock.module('stripe',{defaultExport:TestStripe});
process.env.STRIPE_SECRET_KEY='sk_test_unit-only';process.env.STRIPE_WEBHOOK_SECRET='whsec_unit-only';process.env.ADMIN_SESSION_SECRET='unit-secret-with-at-least-thirty-two-characters';process.env.SITE_URL='https://www.tsoiebeauty.com';
const payments=await import('../lib/payments.js');const {readCatalog,mutateCatalog}=await import('../lib/storage.js');
const routes=Object.fromEntries(await Promise.all(['checkout','stripe-webhook','order','products'].map(async name=>[name,(await import('../api/'+name+'.js')).default])));
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};const route=routes[url.pathname.split('/').at(-1)];if(!route){res.statusCode=404;return res.end();}if(url.pathname!=='/api/stripe-webhook'){let raw='';for await(const c of req)raw+=c;req.body=raw?JSON.parse(raw):undefined;}await route(req,res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;after(()=>server.close());
async function request(path,method='GET',data,headers={}){return fetch(base+path,{method,headers:{origin:base,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});}
async function webhook(type,session,invalid=false){const payload=JSON.stringify({id:'evt_'+randomUUID(),type,data:{object:session}});const signature=new RealStripe('sk_test_unit-only').webhooks.generateTestHeaderString({payload,secret:invalid?'wrong':process.env.STRIPE_WEBHOOK_SECRET});return fetch(base+'/api/stripe-webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload});}
test('checkout uses server prices, reserves stock, verifies Stripe signatures and confirms orders idempotently',async()=>{
 await readCatalog();await mutateCatalog(data=>{data.products[0].price=1500;data.products[0].stock=2;});
 let res=await request('/api/checkout');assert.equal((await res.json()).ready,true);
 res=await request('/api/checkout','POST',{requestId:randomUUID(),items:[{id:'1',quantity:1,shade:0}]});assert.equal(res.status,409);
 res=await request('/api/checkout','POST',{requestId:randomUUID(),items:[{id:'0',quantity:0,shade:0}]});assert.equal(res.status,400);
 const id=randomUUID();const cart={requestId:id,items:[{id:'0',quantity:1,shade:0,price:1,unitAmount:1}]};
 res=await request('/api/checkout','POST',cart);assert.equal(res.status,200);assert.match((await res.json()).url,/checkout.stripe.com/);assert.equal(lastParams.line_items[0].price_data.unit_amount,1500);assert.equal(lastParams.shipping_options[0].shipping_rate_data.fixed_amount.amount,0);
 res=await request('/api/checkout','POST',cart);assert.equal(res.status,200);assert.equal(sessionCreates,1);
 res=await request('/api/products');assert.equal((await res.json()).products.find(p=>p.id==='0').stock,1);
 res=await request('/api/checkout','POST',{requestId:randomUUID(),items:[{id:'0',quantity:2,shade:0}]});assert.equal(res.status,409);
 const session=sessions.get('cs_test_1');session.status='complete';session.payment_status='paid';session.customer_details={name:'Test Customer',email:'customer@example.com'};
 res=await webhook('checkout.session.completed',session,true);assert.equal(res.status,400);
 res=await webhook('checkout.session.completed',{...session,amount_total:1});assert.equal(res.status,500);
 res=await webhook('checkout.session.completed',session);assert.equal(res.status,200);
 res=await webhook('checkout.session.completed',session);assert.equal(res.status,200);
 const record=await payments.readOrder(id);assert.equal(record.data.status,'paid');assert.equal(record.data.total,1500);assert.equal(record.data.customer.email,'customer@example.com');
 const data=(await readCatalog()).data;assert.equal(data.products[0].stock,1);assert.equal(data.paidOrderIds.filter(x=>x===id).length,1);assert.ok(!data.stockReservations[id]);
 const token=payments.accessToken(record.data);res=await request('/api/order?id='+id+'&token='+token);const order=await res.json();assert.equal(order.status,'paid');assert.equal(order.items[0].unitAmount,1500);assert.ok(!('customer' in order));
 res=await request('/api/order?id='+id+'&token='+'0'.repeat(64));assert.equal(res.status,404);
 const expiringId=randomUUID();res=await request('/api/checkout','POST',{requestId:expiringId,items:[{id:'0',quantity:1,shade:0}]});assert.equal(res.status,200);res=await webhook('checkout.session.expired',sessions.get('cs_test_2'));assert.equal(res.status,200);assert.equal((await payments.readOrder(expiringId)).data.status,'expired');assert.ok(!(await readCatalog()).data.stockReservations[expiringId]);
});
test('live money remains disabled without explicit live configuration',()=>{
 const original=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY='sk_live_unit-only';const settings=payments.paymentSettings();assert.equal(settings.ready,false);assert.ok(settings.missing.includes('STRIPE_LIVE_ENABLED'));assert.ok(settings.missing.includes('CHECKOUT_SHIPPING_MINOR'));assert.ok(settings.missing.includes('CHECKOUT_ALLOWED_COUNTRIES'));process.env.STRIPE_SECRET_KEY=original;
});
