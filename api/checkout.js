import {savedCart} from '../lib/cart.js';
import {paymentSettings,createCheckout,checkoutLimit} from '../lib/payments.js';
import {noCache,sameOrigin,jsonBody,handleError,method} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET','POST']))return;
 try{if(req.method==='GET'){const s=paymentSettings();return res.status(200).json({ready:s.ready,live:s.live,test:!s.live,currency:'GBP',shipping:s.shipping,countries:s.countries});}
 sameOrigin(req);await checkoutLimit(req);const body=jsonBody(req);if(body.useSavedCart){const cart=await savedCart(req,res);body.items=cart.items.map(i=>({id:i.id,quantity:i.qty,shade:i.shade}));}const result=await createCheckout(body);return res.status(200).json(result);
 }catch(e){if(e.statusCode)console.error('Stripe checkout diagnostics:',e.type||e.name,e.code||'',e.param||'',e.type==='StripeInvalidRequestError'?String(e.message).replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+/g,'[redacted]'):'');return handleError(res,e);}
}
