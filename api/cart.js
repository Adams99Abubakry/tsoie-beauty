import {savedCart,updateCart} from '../lib/cart.js';
import {limitRequest} from '../lib/limits.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET','PUT']))return;
 try{if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site requests are not allowed.');if(req.method==='GET'){const cart=await savedCart(req,res);return res.status(200).json({items:cart.items,revision:cart.revision});}
 sameOrigin(req);await limitRequest(req,'cart',120,15*60*1000);const cart=await updateCart(req,res,jsonBody(req,{maxBytes:16000}));return res.status(200).json({items:cart.items,revision:cart.revision});
 }catch(e){return handleError(res,e);}
}
