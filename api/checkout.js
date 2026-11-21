import {paymentSettings,createCheckout,checkoutLimit} from '../lib/payments.js';
import {noCache,sameOrigin,jsonBody,handleError,method} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET','POST']))return;
 try{if(req.method==='GET'){const s=paymentSettings();return res.status(200).json({ready:s.ready,live:s.live,test:!s.live,currency:'GBP',shipping:s.shipping,countries:s.countries});}
 sameOrigin(req);await checkoutLimit(req);const result=await createCheckout(jsonBody(req));return res.status(200).json(result);
 }catch(e){return handleError(res,e);}
}
