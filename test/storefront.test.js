import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {seedProducts} from '../lib/seed.js';
test('storefront renders uploaded products, updated prices and existing bag entries',async()=>{
 const nodes={};const node=()=>({innerHTML:'',textContent:'',style:{},addEventListener(){},hidden:true});
 const custom={...seedProducts[0],id:'3e685686-a138-4147-8b63-5f8a9107abf9',name:'New <Lip> Colour',price:3500,stock:2,image:'/api/media?id=3e685686-a138-4147-8b63-5f8a9107abf9'};
 let fixtures={version:1,products:[...structuredClone(seedProducts),custom]};
 const context={document:{querySelector:s=>s==='#catalog-error'?null:(nodes[s]??=node()),querySelectorAll:()=>[],addEventListener(){},title:'',hidden:false},localStorage:{getItem:()=>JSON.stringify([{id:0,qty:1,shade:0}]),setItem(){}},location:{hash:'#/shop'},window:{addEventListener(){},scrollTo(){},scrollY:0},setInterval(){},setTimeout(){},clearTimeout(){},console,fetch:async()=>({ok:true,json:async()=>structuredClone(fixtures)})};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),context);await vm.runInContext('refreshCatalog()',context);
 assert.match(nodes['#product-grid'].innerHTML,/£35\.00/);assert.match(nodes['#product-grid'].innerHTML,/New &lt;Lip&gt; Colour/);assert.match(nodes['#product-grid'].innerHTML,/\/api\/media\?id=/);
 context.location.hash='#/product/'+custom.id;vm.runInContext('render()',context);assert.match(nodes['#app'].innerHTML,/£35\.00/);assert.match(nodes['#app'].innerHTML,/New &lt;Lip&gt; Colour/);
 vm.runInContext(`addBag('${custom.id}');addBag('${custom.id}');addBag('${custom.id}')`,context);assert.equal(nodes['#bag-count'].textContent,'Bag (3)');assert.match(nodes['#toast'].textContent,/not enough stock/);
 context.location.hash='#/bag';vm.runInContext('render()',context);assert.match(nodes['#app'].innerHTML,/£70\.00/);assert.match(nodes['#app'].innerHTML,/Prices to be confirmed/);
 fixtures.version++;fixtures.products[0].price=2000;await vm.runInContext('refreshCatalog()',context);assert.match(nodes['#app'].innerHTML,/£90\.00/);
 fixtures.version++;fixtures.products=fixtures.products.filter(p=>p.id!==custom.id);await vm.runInContext('refreshCatalog()',context);assert.match(nodes['#app'].innerHTML,/Product unavailable/);
});
