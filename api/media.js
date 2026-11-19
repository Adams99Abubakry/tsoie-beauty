import {get} from '@vercel/blob';
import {method,handleError} from '../lib/http.js';
export default async function handler(req,res){
  if(!method(req,res,['GET']))return;
  const id=req.query?.id;if(typeof id!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(id))return res.status(404).end();
  try{const result=await get(`images/${id}.webp`,{access:'private'});if(!result)return res.status(404).end();res.setHeader('Content-Type','image/webp');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.send(Buffer.from(await new Response(result.stream).arrayBuffer()));}catch(e){return handleError(res,e);}
}
