import {getIronSession} from 'iron-session';
import {createHash,createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readDocument,writeDocument,isConflict} from './storage.js';
import {HttpError} from './http.js';
const scrypt=promisify(scryptCallback);
export const credentialPath='security/admin-account.json';
export function accountVersion(hash){return createHash('sha256').update(hash).digest('hex');}
export async function readAccount(){
  const existing=await readDocument(credentialPath);if(existing)return existing;
  if(!process.env.ADMIN_PASSWORD_HASH||!process.env.ADMIN_EMAIL)throw new Error('Admin account not configured');
  const data={email:process.env.ADMIN_EMAIL,passwordHash:process.env.ADMIN_PASSWORD_HASH,updatedAt:new Date().toISOString()};
  try{const result=await writeDocument(credentialPath,data);return {data,etag:result.etag};}catch(e){if(isConflict(e))return readAccount();throw e;}
}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return salt+':'+hash.toString('hex');}
export async function passwordMatches(password,storedHash){
  if(typeof password!=='string'||password.length>256)return false;
  const [salt,hash]=String(storedHash||'').split(':');if(!salt||!hash)throw new Error('Admin account not configured');
  const expected=Buffer.from(hash,'hex');const actual=await scrypt(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function session(req,res){if(!process.env.ADMIN_SESSION_SECRET)throw new Error('Session not configured');return getIronSession(req,res,{cookieName:'tsoie_admin',password:process.env.ADMIN_SESSION_SECRET,ttl:8*60*60,cookieOptions:{httpOnly:true,secure:process.env.NODE_ENV!=='test',sameSite:'strict',path:'/'}});}
export async function requireAdmin(req,res){const s=await session(req,res);if(!s.email||s.email!==process.env.ADMIN_EMAIL)throw new HttpError(401,'Please sign in to continue.');const {data}=await readAccount();if(s.accountVersion!==accountVersion(data.passwordHash))throw new HttpError(401,'Please sign in to continue.');return s;}
export async function loginLimit(req){
  const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';
  const key=createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(String(ip).split(',')[0].trim()).digest('hex');
  const path=`security/login-${key}.json`;const now=Date.now();
  for(let i=0;i<6;i++){
    const old=await readDocument(path);const state=old?.data?.until>now?old.data:{attempts:0,until:now+15*60*1000};
    if(state.attempts>=10)throw new HttpError(429,'Too many sign-in attempts. Please try again in 15 minutes.');
    state.attempts++;
    try{await writeDocument(path,state,old?.etag);return;}catch(e){if(!isConflict(e))throw e;}
  }
  throw new HttpError(429,'Please wait a moment before trying again.');
}
