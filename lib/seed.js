export const seedProducts = ['Signature Lip Colour','Satin Lip Veil','Skin Finish Compact','Soft-Focus Skin Tint','High-Shine Lip Oil','Velvet Setting Powder','Matte Lip Colour','Radiant Base','Luminous Top Coat'].map((name,i)=>({
  id:String(i), name, category:[0,1,4,6,8].includes(i)?'Lips':'Complexion',
  badge:i<3||i===4?'NEW':i===3?'BESTSELLER':i===8?'LIMITED':'',
  image:`/assets/${['lip','veil','compact','bottle','veil','compact','lip','bottle','veil'][i]}.png`,
  price:null, currency:'GBP', shortDescription:'Performance-led colour · refined finish',
  description:'A premium colour concept with a smooth glide, elegant payoff and a polished finish designed to wear beautifully.',
  published:true, stock:null, revision:1, createdAt:'2026-11-15T00:00:00.000Z', updatedAt:'2026-11-15T00:00:00.000Z'
}));
