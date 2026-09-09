import {test} from 'node:test';
import assert from 'node:assert/strict';
import Sync from '../ui/sync-core.js';
import Model from '../ui/model.js';
import worker, {parseEstimate} from '../cloud/worker.mjs';
const base={version:1,foods:[],recipes:[],targets:[{date:'2020-01-01',kcal:2000,protein:100}],days:{}};
const food={id:'pasta',name:'Macarrão cozido',unit:'g',base:100,kcal:150,protein:5,source:'Exemplo',confidence:'estimate',favorite:false};
const entry=id=>({id,food,quantity:150,meal:'Almoço',date:'2026-09-08'});
test('dois aparelhos adicionam refeições sem perder registros',()=>{
 const b=Sync.flatten(base),local={...b,'entries/a':entry('a')},remote={...b,'entries/b':entry('b')};
 const result=Sync.merge(b,local,remote);
 assert.equal(result.conflicts.length,0);assert.equal(result.state.days['2026-09-08'].entries.length,2);
 Model.state(result.state);
});
test('edição concorrente e exclusão exigem escolha explícita',()=>{
 const b={...Sync.flatten(base),'entries/a':entry('a')};
 const local={...b,'entries/a':{...entry('a'),quantity:200}},remote={...b,'entries/a':null};
 const result=Sync.merge(b,local,remote);assert.equal(result.conflicts.length,1);
 assert.equal(result.state.days['2026-09-08'].entries[0].quantity,200);
});
test('resposta perdida e tentativa repetida não duplicam registros',()=>{
 const s={...base,foods:[food]},flat=Sync.flatten(s);
 const rows=Object.entries(flat).map(([key,value])=>({key,value,version:1}));
 assert.deepEqual(Sync.changes(rows,s),[]);
 assert.equal(Sync.merge(Sync.flatten(base),flat,flat).conflicts.length,0);
});
test('validação rejeita valores não finitos e IDs adulterados',()=>{
 assert.throws(()=>Model.record('foods/pasta',{...food,kcal:NaN}));
 assert.throws(()=>Model.record('foods/other',food));
 assert.throws(()=>Model.record('entries/a',{...entry('a'),quantity:-1}));
});
test('foto pede esclarecimento e rejeita totais inválidos',()=>{
 const response=value=>({status:'completed',steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(value)}]}]});
 assert.equal(parseEstimate(response({status:'clarify',question:'O prato foi dividido?',items:[]})).status,'clarify');
 const item={name:'Arroz',base:150,unit:'g',kcal:190,protein:null,note:'Porção estimada.'};
 assert.equal(parseEstimate(response({status:'estimate',question:'',items:[item]})).items[0].protein,null);
 assert.throws(()=>parseEstimate(response({status:'estimate',items:[{...item,kcal:-1}]})));
});
test('API rejeita origem externa e acesso sem sessão',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-test',OWNER_EMAIL:'owner@example.test'};
 const external=await worker.fetch(new Request('https://food.example/api/sync',{method:'POST',headers:{Origin:'https://evil.example','X-Food-Tracker':'1'},body:'{}'}),env);
 assert.equal(external.status,403);
 const noSession=await worker.fetch(new Request('https://food.example/api/auth/session'),env);
 assert.equal(noSession.status,401);
});
