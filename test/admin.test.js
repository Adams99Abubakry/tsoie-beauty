import {test,mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {scryptSync} from 'node:crypto';
import sharp from 'sharp';
const blobs=new Map();
class BlobNotFoundError extends Error {}
class BlobPreconditionFailedError extends Error {}
class BlobAlreadyExistsError extends Error {constructor(){super();this.name='BlobAlreadyExistsError';}}
let serial=0;
mock.module('@vercel/blob',{namedExports:{BlobNotFoundError,BlobPreconditionFailedError,
 get:async path=>{const b=blobs.get(path);return b?{statusCode:200,blob:{etag:'W/'+b.etag},stream:new ReadableStream({start(c){c.enqueue(b.bytes);c.close();}})}:null;},
 put:async(path,body,options)=>{const old=blobs.get(path);if(options.ifMatch&&old?.etag!==options.ifMatch)throw new BlobPreconditionFailedError();if(!options.ifMatch&&old&&!options.allowOverwrite)throw new BlobAlreadyExistsError();const etag=String(++serial);blobs.set(path,{etag,bytes:typeof body==='string'?Buffer.from(body):body});return {etag};}
}});
process.env.NODE_ENV='test';process.env.ADMIN_EMAIL='admin@tsoiebeauty.com';process.env.ADMIN_SESSION_SECRET='test-session-secret-that-is-longer-than-thirty-two-characters';process.env.ADMIN_PASSWORD_HASH='test-salt:'+scryptSync('test-password','test-salt',64).toString('hex');
const handlers=Object.fromEntries(await Promise.all(['session','products','upload','media'].map(async name=>[name,(await import(`../api/${name}.js`)).default])));
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');req.query=Object.fromEntries(url.searchParams);let raw='';for await(const c of req)raw+=c;try{req.body=raw?JSON.parse(raw):undefined;}catch{res.statusCode=400;res.end();return;}res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};res.send=body=>res.end(body);const handler=handlers[url.pathname.split('/').at(-1)];if(handler)await handler(req,res);else{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;after(()=>server.close());
let cookie='';
async function request(path,method='GET',body,options={}){return fetch(base+path,{method,headers:{origin:base,...(body?{'Content-Type':'application/json'}:{}),...(options.auth===false?{}:{cookie}),...options.headers},body:body?JSON.stringify(body):undefined});}
const draft={name:'Test product',category:'Lips',badge:'NEW',price:2499,stock:5,image:'/assets/lip.png',shortDescription:'Soft satin',description:'A test product description.',published:false};
test('protected admin, product edits, uploads and storefront data work together',async()=>{
 let res=await request('/api/session');assert.equal(res.status,401);
 res=await request('/api/products?admin=1');assert.equal(res.status,401);
 res=await request('/api/products','POST',draft);assert.equal(res.status,401);
 res=await request('/api/session','POST',{email:process.env.ADMIN_EMAIL,password:'wrong'});assert.equal(res.status,401);
 res=await request('/api/session','POST',{email:process.env.ADMIN_EMAIL,password:'test-password'});assert.equal(res.status,200);cookie=res.headers.get('set-cookie').split(';')[0];assert.match(res.headers.get('set-cookie'),/HttpOnly/i);assert.match(res.headers.get('set-cookie'),/SameSite=Strict/i);
 res=await request('/api/session');assert.equal((await res.json()).email,process.env.ADMIN_EMAIL);
 res=await request('/api/products?admin=1');assert.equal((await res.json()).products.length,9);
 res=await request('/api/products','POST',draft,{headers:{origin:'https://evil.example'}});assert.equal(res.status,403);
 res=await request('/api/products','POST',{...draft,price:-100});assert.equal(res.status,400);
 res=await request('/api/products','POST',draft);assert.equal(res.status,201);let product=(await res.json()).product;assert.equal(product.price,2499);
 res=await request('/api/products');assert.equal((await res.json()).products.some(p=>p.id===product.id),false);
 const image=await sharp({create:{width:4,height:4,channels:3,background:'#aa7744'}}).png().toBuffer();
 res=await request('/api/upload','POST',{data:'data:image/png;base64,'+image.toString('base64')});assert.equal(res.status,201);const uploaded=await res.json();assert.match(uploaded.image,/^\/api\/media\?id=/);
 res=await request(uploaded.image);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/webp');assert.ok((await res.arrayBuffer()).byteLength>20);
 res=await request('/api/upload','POST',{data:'data:image/svg+xml;base64,PHN2Zz4='});assert.equal(res.status,400);
 res=await request('/api/upload','POST',{data:'data:image/png;base64,'+image.toString('base64')},{auth:false});assert.equal(res.status,401);
 res=await request('/api/products','PUT',{...product,price:3500,published:true,image:uploaded.image});assert.equal(res.status,200);const updated=(await res.json()).product;assert.equal(updated.revision,2);
 res=await request('/api/products','PUT',{...product,name:'Stale edit'});assert.equal(res.status,409);
 res=await request('/api/products');const visible=(await res.json()).products.find(p=>p.id===product.id);assert.equal(visible.price,3500);assert.equal(visible.image,uploaded.image);
 res=await request('/api/products','DELETE',{id:updated.id,revision:updated.revision});assert.equal(res.status,200);res=await request('/api/products?admin=1');assert.equal((await res.json()).products.length,9);
 res=await request('/api/session','DELETE');assert.equal(res.status,200);cookie=res.headers.get('set-cookie').split(';')[0];res=await request('/api/session');assert.equal(res.status,401);
});
test('login attempts are limited across requests',async()=>{
 for(let i=0;i<10;i++){const res=await request('/api/session','POST',{email:process.env.ADMIN_EMAIL,password:'wrong'},{headers:{'x-forwarded-for':'192.0.2.10'}});assert.equal(res.status,401);}
 const res=await request('/api/session','POST',{email:process.env.ADMIN_EMAIL,password:'test-password'},{headers:{'x-forwarded-for':'192.0.2.10'}});assert.equal(res.status,429);
});
