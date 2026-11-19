import {get,put,BlobNotFoundError,BlobPreconditionFailedError} from '@vercel/blob';
import {seedProducts} from './seed.js';
import {HttpError} from './http.js';
export async function readDocument(path){
  try{const result=await get(path,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});if(!result)return null;return {data:await new Response(result.stream).json(),etag:result.blob.etag.replace(/^W\//,'')};}catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}
}
export async function writeDocument(path,data,etag){
  return put(path,JSON.stringify(data),{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,...(etag?{ifMatch:etag}:{allowOverwrite:false})});
}
export function isConflict(e){return e instanceof BlobPreconditionFailedError||e.name==='BlobAlreadyExistsError';}
export async function readCatalog(){
  const existing=await readDocument('catalog/products.json');if(existing)return existing;
  const data={version:1,products:structuredClone(seedProducts)};
  try{const result=await writeDocument('catalog/products.json',data);return {data,etag:result.etag};}catch(e){if(isConflict(e))return readCatalog();throw e;}
}
export async function mutateCatalog(mutate){
  for(let i=0;i<5;i++){
    const current=await readCatalog();const data=structuredClone(current.data);const result=mutate(data);data.version++;
    try{await writeDocument('catalog/products.json',data,current.etag);return result;}catch(e){if(!isConflict(e))throw e;}
  }
  throw new HttpError(409,'Another update is in progress. Refresh and try again.');
}
