export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function noCache(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');}
export function sameOrigin(req){
  const origin=req.headers.origin;
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(!origin||new URL(origin).host!==host)throw new HttpError(403,'This request must come from this website.');
  if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site requests are not allowed.');
}
export function jsonBody(req){if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'Send application/json.');let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new HttpError(400,'Invalid JSON.');}}if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid request.');return body;}
export function handleError(res,error){if(error.status)return res.status(error.status).json({error:error.message});console.error('Admin service error:',error.name,error.statusCode||'');return res.status(503).json({error:'The service is temporarily unavailable. Please try again.'});}
export function method(req,res,allowed){if(!allowed.includes(req.method)){res.setHeader('Allow',allowed.join(', '));res.status(405).json({error:'Method not allowed.'});return false;}return true;}
