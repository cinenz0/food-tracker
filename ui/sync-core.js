/* Shared, deterministic three-way merge. Never use timestamps to pick a winner. */
(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const equal=(a,b)=>canonical(a??null)===canonical(b??null);
 function flatten(s){
  const m={};
  for(const kind of ['foods','recipes','targets'])for(const value of s[kind]||[])m[`${kind}/${value.id||value.date}`]=copy(value);
  for(const [date,day] of Object.entries(s.days||{})){
   m[`days/${date}`]={complete:day.complete};
   for(const entry of day.entries)m[`entries/${entry.id}`]={...copy(entry),date};
  }
  return m;
 }
 function expand(m){
  const s={version:1,foods:[],recipes:[],targets:[],days:{}};
  for(const [key,v] of Object.entries(m)){
   if(v==null)continue;const [kind,id]=key.split('/');
   if(['foods','recipes','targets'].includes(kind))s[kind].push(copy(v));
   else if(kind==='days')s.days[id]={complete:v.complete,entries:[]};
  }
  for(const [key,v] of Object.entries(m))if(key.startsWith('entries/')&&v){
   const {date,...entry}=copy(v);(s.days[date]??={complete:false,entries:[]}).entries.push(entry);
  }
  s.targets.sort((a,b)=>a.date.localeCompare(b.date));
  return s;
 }
 const rowMap=rows=>Object.fromEntries(rows.map(r=>[r.key,r.value]));
 function changes(rows,desired){
  const versions=Object.fromEntries(rows.map(r=>[r.key,r.version])),base=rowMap(rows),local=flatten(desired);
  return [...new Set([...Object.keys(base),...Object.keys(local)])].filter(k=>!equal(base[k],local[k])).map(key=>({key,value:local[key]??null,base_version:versions[key]||0}));
 }
 function merge(base,local,remote){
  const values={},conflicts=[];
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const changed=!equal(local[key],base[key]),other=!equal(remote[key],base[key]);
   if(changed&&other&&!equal(local[key],remote[key]))conflicts.push({key,local:local[key]??null,remote:remote[key]??null});
   values[key]=changed?local[key]??null:remote[key]??null;
  }
  return {state:expand(values),conflicts};
 }
 const api={flatten,expand,rowMap,changes,merge,equal};
 if(typeof module!=='undefined')module.exports=api;else root.FoodSync=api;
})(globalThis);
