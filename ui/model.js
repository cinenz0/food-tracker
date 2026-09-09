(function(root){
 'use strict';
 const fail=()=>{throw Error('Dados inválidos. Confira quantidades, nomes e datas.');};
 const num=(v,min=0,max=100000)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail();};
 const str=(v,max=240)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail();};
 const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))fail();};
 const date=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail();};
 function food(f){id(f.id);str(f.name);str(f.unit,30);str(f.source,500);num(f.base,.001);num(f.kcal);if(f.protein!==null)num(f.protein);if(!['label','table','estimate'].includes(f.confidence)||typeof f.favorite!=='boolean')fail();}
 function record(key,v){
  if(!/^(foods|recipes|targets|days|entries)\/[A-Za-z0-9_-]{1,100}$/.test(key))fail();if(v===null)return;
  if(!v||typeof v!=='object'||Array.isArray(v)||JSON.stringify(v).length>60000)fail();
  const [kind,identity]=key.split('/');
  if(kind==='foods'){food(v);if(v.id!==identity)fail();}
  if(kind==='recipes'){id(v.id);if(v.id!==identity)fail();str(v.name);num(v.servings,.001,10000);if(!Array.isArray(v.items)||!v.items.length||v.items.length>100)fail();v.items.forEach(i=>{id(i.foodId);num(i.quantity,.001);});}
  if(kind==='targets'){date(v.date);if(v.date!==identity)fail();num(v.kcal,1,20000);num(v.protein,0,1000);}
  if(kind==='days'){date(identity);if(typeof v.complete!=='boolean')fail();}
  if(kind==='entries'){id(v.id);if(v.id!==identity)fail();date(v.date);food(v.food);str(v.meal,80);num(v.quantity,.001);}
 }
 function state(s){
  if(!s||s.version!==1||!Array.isArray(s.foods)||!Array.isArray(s.recipes)||!Array.isArray(s.targets)||!s.targets.length||!s.days||Array.isArray(s.days))fail();
  for(const k of ['foods','recipes','targets'])if(s[k].length>10000)fail();
  const keys=new Set();const check=(key,v)=>{if(keys.has(key))fail();keys.add(key);record(key,v);};
  s.foods.forEach(f=>check('foods/'+f.id,f));
  s.recipes.forEach(r=>{check('recipes/'+r.id,r);r.items.forEach(i=>{if(!s.foods.some(f=>f.id===i.foodId))fail();});});
  s.targets.forEach(t=>check('targets/'+t.date,t));
  if(Object.keys(s.days).length>40000)fail();
  Object.entries(s.days).forEach(([d,v])=>{check('days/'+d,{complete:v.complete});if(!Array.isArray(v.entries)||v.entries.length>1000)fail();v.entries.forEach(e=>check('entries/'+e.id,{...e,date:d}));});
  if(JSON.stringify(s).length>20000000)fail();return s;
 }
 const api={state,record,food,num};if(typeof module!=='undefined')module.exports=api;else root.FoodModel=api;
})(globalThis);
