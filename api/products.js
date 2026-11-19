import {randomUUID} from 'node:crypto';
import {readCatalog,mutateCatalog} from '../lib/storage.js';
import {requireAdmin} from '../lib/auth.js';
import {validateProduct} from '../lib/products.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
export default async function handler(req,res){
  noCache(res);if(!method(req,res,['GET','POST','PUT','DELETE']))return;
  try{
    if(req.method==='GET'){
      const admin=req.query?.admin==='1';if(admin)await requireAdmin(req,res);
      const {data}=await readCatalog();return res.status(200).json({version:data.version,products:data.products.filter(p=>admin||p.published)});
    }
    sameOrigin(req);await requireAdmin(req,res);const body=jsonBody(req),fields=req.method==='DELETE'?null:validateProduct(body);
    const now=new Date().toISOString();
    const product=await mutateCatalog(data=>{
      if(req.method==='POST'){
        if(data.products.length>=1000)throw new HttpError(400,'The catalogue has reached its product limit.');
        const created={...fields,id:randomUUID(),revision:1,createdAt:now,updatedAt:now};data.products.unshift(created);return created;
      }
      const index=data.products.findIndex(p=>p.id===body.id);if(index<0)throw new HttpError(404,'Product not found.');const old=data.products[index];
      if(body.revision!==old.revision)throw new HttpError(409,'This product was updated elsewhere. Refresh the catalogue before editing again.');
      if(req.method==='DELETE'){data.products.splice(index,1);return {id:old.id,deleted:true};}
      const updated={...old,...fields,revision:old.revision+1,updatedAt:now};data.products[index]=updated;return updated;
    });
    return res.status(req.method==='POST'?201:200).json({product});
  }catch(e){return handleError(res,e);}
}
