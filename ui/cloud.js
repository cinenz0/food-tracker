(function(){
 'use strict';
 if(!window.FOOD_CLOUD)return;
 const copy=x=>JSON.parse(JSON.stringify(x)),empty=()=>({version:1,foods:[],recipes:[],targets:[{date:'2020-01-01',kcal:2000,protein:100}],days:{}});
 let dbPromise,user=null,cached=null,syncing=false,lastError='',initialized=false;
 const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('food-tracker'):null;
 function db(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('food-tracker-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('accounts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Não foi possível abrir o armazenamento do aparelho.'));});}
 async function read(uid=user.id){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('accounts').objectStore('accounts').get(uid);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function mutate(fn,uid=user.id){const d=await db();return new Promise((resolve,reject)=>{
  const tx=d.transaction('accounts','readwrite'),store=tx.objectStore('accounts'),r=store.get(uid);let next;
  r.onsuccess=()=>{try{next=fn(r.result);store.put(next,uid);}catch(e){reject(e);tx.abort();}};
  tx.oncomplete=()=>{if(user?.id===uid)cached=next;resolve(copy(next));};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Error('A alteração não foi salva.'));
 });}
 async function request(path,data,timeout=20000){
  let res;try{res=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-Food-Tracker':'1'}:{},body:data?JSON.stringify(data):undefined,credentials:'same-origin',signal:AbortSignal.timeout(timeout)});}catch{throw Error('Sem conexão. Seus registros salvos neste aparelho serão enviados ao reconectar.');}
  const b=await res.json();if(!res.ok)throw Object.assign(Error(b.error||'Não foi possível concluir.'),{status:res.status});return b;
 }
 function pending(){return cached?FoodSync.changes(cached.records,cached.state).length:0;}
 function status(){if(cached?.conflicts.length)return 'Há alterações para conferir';if(lastError)return lastError;if(syncing)return 'Sincronizando…';if(pending())return navigator.onLine?'Salvo neste aparelho · aguardando envio':'Salvo neste aparelho · sem internet';return navigator.onLine?'Tudo sincronizado':'Disponível neste aparelho · sem internet';}
 function notify(){window.dispatchEvent(new CustomEvent('food-cloud-status'));channel?.postMessage({uid:user?.id});}
 async function synchronize(){
  if(!user||!navigator.onLine||syncing)return;
  syncing=true;const uid=user.id,start=await read(uid);if(!start||start.conflicts.length){syncing=false;return;}
  lastError='';notify();
  try{
   const delta=FoodSync.changes(start.records,start.state);
   const batch=delta.slice(0,2000),result=await request('sync',{changes:batch});
   if(user?.id!==uid)return;
   const baseline=FoodSync.rowMap(start.records);
   if(result.applied)for(const c of batch)baseline[c.key]=c.value;
   await mutate(latest=>{
    const merged=FoodSync.merge(baseline,FoodSync.flatten(latest.state),FoodSync.rowMap(result.records));
    // If cloud is empty, retain local/default targets; remote deletion of every target is invalid.
    if(!merged.state.targets.length)merged.state.targets=latest.state.targets;
    FoodModel.state(merged.state);
    return {...latest,records:result.records,state:merged.state,conflicts:merged.conflicts,revision:latest.revision+(FoodSync.equal(latest.state,merged.state)&&FoodSync.equal(latest.conflicts,merged.conflicts)?0:1)};
   },uid);
   window.dispatchEvent(new CustomEvent('food-cloud-updated'));
   if(pending()&&!cached.conflicts.length)setTimeout(synchronize,500);
  }catch(e){lastError=e.status===401?'Entre novamente para sincronizar':e.message;}
  finally{syncing=false;notify();}
 }
 function loginScreen(){return new Promise(resolve=>{
  const main=document.getElementById('main');document.body.classList.add('signed-out');
  main.innerHTML='<section class="login-card"><p class="login-brand">Food Tracker</p><h1>Seu diário, com você.</h1><p>Entre para acessar suas refeições no iPhone e no computador.</p><form id="cloud-login"><label class="field">E-mail<input name="email" type="email" required autocomplete="username"></label><label class="field">Senha<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Entrar</button><p class="error" role="alert"></p></form><p class="help">Acesso pessoal. Sua conta é criada na configuração inicial do aplicativo.</p></section>';
  main.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;f.querySelector('.error').textContent='';
   try{const session=await request('auth/login',{email:f.email.value.trim(),password:f.password.value});f.password.value='';user=session.user;localStorage.setItem('food-tracker-account',JSON.stringify(user));document.body.classList.remove('signed-out');resolve();}catch(error){f.querySelector('.error').textContent=error.message;}finally{b.disabled=false;}
  });
 });}
 async function initialize(){
  if(initialized)return;
  try{const session=await request('auth/session',null,8000);user=session.user;localStorage.setItem('food-tracker-account',JSON.stringify(user));}
  catch(e){try{const saved=JSON.parse(localStorage.getItem('food-tracker-account'));if(saved&&await read(saved.id))user=saved;}catch{}if(!user)await loginScreen();}
  cached=await read();if(!cached){
   const initial=await request('sync',{changes:[]});
   const remote=FoodSync.expand(FoodSync.rowMap(initial.records));
   cached=await mutate(()=>({records:initial.records,state:remote.targets.length?remote:empty(),revision:0,conflicts:[],backup:null}));
  }
  initialized=true;document.body.classList.add('cloud-mode');synchronize();
  navigator.storage?.persist?.().catch(()=>{});
 }
 async function api(path,payload){
  await initialize();
  if(path==='state'){cached=await read();return {state:copy(cached.state),revision:cached.revision};}
  if(path==='save'||path==='restore'){
   FoodModel.state(payload.state);
   const next=await mutate(old=>{
    let desired=copy(payload.state),conflicts=old.conflicts;
    if(old.revision!==payload.revision){
     if(!payload.baseState)throw Error('O diário mudou. Atualize antes de restaurar o backup.');
     FoodModel.state(payload.baseState);
     const merged=FoodSync.merge(FoodSync.flatten(payload.baseState),FoodSync.flatten(payload.state),FoodSync.flatten(old.state));
     desired=merged.state;conflicts=[...old.conflicts.filter(c=>!merged.conflicts.some(m=>m.key===c.key)),...merged.conflicts];
    }
    FoodModel.state(desired);
    return {...old,state:desired,conflicts,revision:old.revision+1,backup:path==='restore'?copy(old.state):old.backup};
   });
   setTimeout(synchronize,0);notify();return {state:copy(next.state),revision:next.revision};
  }
  if(path==='backup')return {state:copy((await read()).state),name:'food-tracker-'+new Date().toISOString().slice(0,10)+'.json'};
  if(path==='ai/status')return request(path);
  if(path==='ai/estimate'||path==='ai/photo'){if(!navigator.onLine)throw Error('Conecte à internet para usar a IA.');return request(path,payload,65000);}
  if(path==='quit')return {ok:true};
  throw Error('Configure a chave do assistente no servidor.');
 }
 async function resolveConflict(key,choice){
  await mutate(old=>{const conflict=old.conflicts.find(c=>c.key===key);if(!conflict)return old;const values=FoodSync.flatten(old.state);values[key]=choice==='remote'?conflict.remote:conflict.local;const state=FoodSync.expand(values);FoodModel.state(state);return {...old,state,conflicts:old.conflicts.filter(c=>c.key!==key),revision:old.revision+1};});
  notify();window.dispatchEvent(new CustomEvent('food-cloud-updated'));synchronize();
 }
 async function logout(){
  if(pending()||cached?.conflicts.length)throw Error('Sincronize ou resolva as alterações antes de sair. Você também pode exportar um backup.');
  await request('auth/logout',{});localStorage.removeItem('food-tracker-account');
  const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('accounts','readwrite');tx.objectStore('accounts').delete(user.id);tx.oncomplete=resolve;tx.onerror=reject;});
  location.reload();
 }
 async function relogin(){await loginScreen();lastError='';await synchronize();}
 window.FoodCloud={enabled:true,api,status,synchronize,resolveConflict,logout,relogin,get conflicts(){return cached?.conflicts||[];},get user(){return user;},get backup(){return cached?.backup;}};
 window.addEventListener('online',synchronize);window.addEventListener('offline',notify);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)synchronize();});
 channel?.addEventListener('message',async e=>{if(e.data.uid===user?.id){cached=await read();window.dispatchEvent(new CustomEvent('food-cloud-updated'));window.dispatchEvent(new CustomEvent('food-cloud-status'));}});
 setInterval(()=>{if(!document.hidden)synchronize();},60000);
})();
