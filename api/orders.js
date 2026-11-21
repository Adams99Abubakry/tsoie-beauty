import {requireAdmin} from '../lib/auth.js';
import {readCatalog} from '../lib/storage.js';
import {readOrder,paymentSettings} from '../lib/payments.js';
import {noCache,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
 noCache(res);if(!method(req,res,['GET']))return;
 try{await requireAdmin(req,res);const page=Number(req.query?.page||0);if(!Number.isInteger(page)||page<0||page>25)throw new HttpError(400,'Invalid page.');
 const {data}=await readCatalog();const index=(data.orderIndex||[]).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));const entries=index.slice(page*20,(page+1)*20);
 const results=await Promise.all(entries.map(e=>readOrder(e.id)));const settings=paymentSettings();
 return res.status(200).json({orders:results.filter(Boolean).map(r=>{const o=r.data;return {id:o.id,number:o.number,status:o.status,live:o.live,createdAt:o.createdAt,paidAt:o.paidAt,total:o.total,shipping:o.shipping,currency:o.currency,items:o.items,customer:o.customer||null,paymentIntentId:o.paymentIntentId||null};}),hasMore:(page+1)*20<index.length,page,paymentSetup:{ready:settings.ready,live:settings.live,missing:settings.missing}});
 }catch(e){return handleError(res,e);}
}
