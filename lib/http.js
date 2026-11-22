export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function noCache(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');}
export function sameOrigin(req){
 const origin=req.headers.origin;const host=req.headers['x-forwarded-host']||req.headers.host;
 const protocol=req.headers['x-forwarded-proto']||(req.socket?.encrypted?'https':'http');
 let parsed;try{parsed=new URL(origin);}catch{throw new HttpError(403,'This request must come from this website.');}
 if(!origin||!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.origin!==`${protocol}://${host}`||req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'This request must come from this website.');
}
export function jsonBody(req,{maxBytes}={}){if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'Send application/json.');let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new HttpError(400,'Invalid JSON.');}}if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid request.');if(maxBytes&&Buffer.byteLength(JSON.stringify(body),'utf8')>maxBytes)throw new HttpError(413,'This request is too large.');return body;}
export function handleError(res,error){if(error.status)return res.status(error.status).json({error:error.message});console.error('Admin service error:',error.name,error.statusCode||'');return res.status(503).json({error:'The service is temporarily unavailable. Please try again.'});}
export function method(req,res,allowed){if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));res.status(405).json({error:'Method not allowed.'});return false;}return true;}
