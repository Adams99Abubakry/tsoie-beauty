import {getIronSession} from 'iron-session';
import {randomUUID} from 'node:crypto';
import {readDocument,writeDocument,isConflict} from './storage.js';
import {HttpError} from './http.js';
const lifetime=30*24*60*60;
export async function cartSession(req,res){
 const s=await getIronSession(req,res,{cookieName:'tsoie_cart',password:process.env.ADMIN_SESSION_SECRET,ttl:lifetime,cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV!=='test',sameSite:'lax',path:'/'}});
 if(typeof s.id!=='string'||!/^[0-9a-f-]{36}$/.test(s.id)){s.id=randomUUID();await s.save();}return s;
}
export async function savedCart(req,res){const session=await cartSession(req,res);const stored=await readDocument(`carts/${session.id}.json`);const valid=stored&&stored.data.expiresAt>Date.now();return {session,stored,items:valid?stored.data.items:[],revision:valid?stored.data.revision:0};}
export function validateCart(items){
 if(!Array.isArray(items)||items.length>30)throw new HttpError(400,'Your cart can contain up to 30 different items.');
 const result=[];const seen=new Set();for(const item of items){if(!item||typeof item.id!=='string'||!(/^[0-8]$/.test(item.id)||/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(item.id))||!Number.isInteger(item.qty)||item.qty<1||item.qty>99||!Number.isInteger(item.shade)||item.shade<0||item.shade>4)throw new HttpError(400,'Your cart contains an invalid item.');const key=item.id+':'+item.shade;if(seen.has(key))throw new HttpError(400,'Combine duplicate cart items before saving.');seen.add(key);result.push({id:item.id,qty:item.qty,shade:item.shade});}return result;
}
export async function updateCart(req,res,body){const current=await savedCart(req,res);if(!Number.isInteger(body.revision)||body.revision!==current.revision)throw new HttpError(409,'Your cart was updated elsewhere. Please refresh and try again.');const items=validateCart(body.items);const data={items,revision:current.revision+1,expiresAt:Date.now()+lifetime*1000};try{await writeDocument(`carts/${current.session.id}.json`,data,current.stored?.etag,{ttlDays:30});}catch(e){if(isConflict(e))throw new HttpError(409,'Your cart was updated elsewhere. Please refresh and try again.');throw e;}await current.session.save();return data;}
