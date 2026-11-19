import {HttpError} from './http.js';
export function validateProduct(input){
  const text=(key,max,required=false)=>{const value=input[key];if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new HttpError(400,`Please enter a valid ${key}.`);return value.trim();};
  const name=text('name',120,true),category=text('category',30,true),badge=text('badge',30),description=text('description',5000),shortDescription=text('shortDescription',250);
  if(!['Lips','Complexion','Eyes','Sets'].includes(category))throw new HttpError(400,'Choose a valid category.');
  const image=text('image',200,true);
  if(!/^\/assets\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(image)&&!/^\/api\/media\?id=[0-9a-f-]{36}$/.test(image))throw new HttpError(400,'Upload a product image.');
  if(input.price!==null&&(!Number.isSafeInteger(input.price)||input.price<0||input.price>100000000))throw new HttpError(400,'Enter a price with at most two decimal places.');
  if(input.stock!==null&&(!Number.isSafeInteger(input.stock)||input.stock<0||input.stock>1000000))throw new HttpError(400,'Enter a valid stock quantity.');
  if(typeof input.published!=='boolean')throw new HttpError(400,'Choose a product status.');
  return {name,category,badge,description,shortDescription,image,price:input.price,currency:'GBP',stock:input.stock,published:input.published};
}
