import {put} from '@vercel/blob';
import sharp from 'sharp';
import {randomUUID} from 'node:crypto';
import {requireAdmin} from '../lib/auth.js';
import {noCache,sameOrigin,jsonBody,handleError,method,HttpError} from '../lib/http.js';
export const config={api:{bodyParser:{sizeLimit:'4mb'}}};
export default async function handler(req,res){
  noCache(res);if(!method(req,res,['POST']))return;
  try{
    sameOrigin(req);await requireAdmin(req,res);const body=jsonBody(req);
    if(typeof body.data!=='string'||body.data.length>4200000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.data))throw new HttpError(400,'Upload a JPG, PNG or WebP image up to 3 MB.');
    const bytes=Buffer.from(body.data.split(',')[1],'base64');if(bytes.length>3*1024*1024)throw new HttpError(413,'Please choose an image smaller than 3 MB.');
    let output;try{const image=sharp(bytes,{limitInputPixels:24000000});const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw new Error('Invalid image');output=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();}catch{throw new HttpError(400,'This image could not be read. Please choose a valid JPG, PNG or WebP image.');}
    const id=randomUUID();await put(`images/${id}.webp`,output,{access:'private',contentType:'image/webp',addRandomSuffix:false,cacheControlMaxAge:31536000});
    return res.status(201).json({image:`/api/media?id=${id}`});
  }catch(e){return handleError(res,e);}
}
