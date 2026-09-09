'use strict';
async function compressedPhoto(file){
 if(!file||file.size>20000000)throw Error('Escolha uma foto de até 20 MB.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Não consegui abrir essa imagem. Tente tirar uma foto ou selecionar uma versão JPEG.'));image.src=url;});
  if(!image.naturalWidth||!image.naturalHeight)throw Error('Imagem vazia.');
  const ratio=Math.min(1,1400/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL('image/jpeg',.8);if(data.length>1800000)data=canvas.toDataURL('image/jpeg',.55);
  if(data.length>1800000)throw Error('A foto ainda está muito grande. Recorte o prato e tente novamente.');
  // Re-encoding removes the source metadata, including embedded location data.
  return {mime_type:'image/jpeg',data:data.split(',')[1]};
 }finally{URL.revokeObjectURL(url);}
}
function openPhoto(){
 editor={type:'photo',meal:meals[0],image:null,items:[],photoRevision:0};
 editorFrame('Registrar por foto',`<p class="source">Fotografe o prato de cima, com boa luz. Você confere as porções antes de salvar.</p><div class="photo-pickers"><label class="primary photo-picker">Tirar foto<input type="file" accept="image/*" capture="environment" data-photo-file></label><label class="secondary photo-picker">Escolher foto<input type="file" accept="image/*" data-photo-file></label></div><img id="photo-preview" class="photo-preview" alt="Foto da refeição selecionada" hidden><form id="photo-form"><label class="field">Refeição<select name="meal">${mealOptions(editor.meal)}</select></label><label class="field">Algum detalhe? <span class="help">Opcional: peso, ingredientes, óleo ou modo de preparo.</span><input name="description" maxlength="500" placeholder="Ex.: 150 g de frango, grelhado com azeite"></label><button type="submit" class="primary" id="photo-analyze" disabled>Estimar refeição</button></form><p class="help">Ao estimar, a foto e os detalhes serão enviados ao Google. No Free Tier, esses dados podem melhorar seus produtos. O Food Tracker não guarda a foto.</p><div id="photo-result" aria-live="polite"></div>${errorSlot}`);
}
function photoReference(item){return item.foodId?foodById(item.foodId):item.reference;}
function collectPhoto(){
 $$('.photo-item').forEach((row,i)=>{const item=editor.items[i];item.quantity=Number($('[name=photo-quantity]',row).value);item.include=$('[name=photo-include]',row).checked;});
 const entries=editor.items.filter(i=>i.include).map(i=>({food:photoReference(i),quantity:i.quantity}));
 const total=sum(entries);$('#photo-total').textContent=`≈ ${fmt(total.kcal)} kcal · ${fmt(total.protein,1)} g de proteína${total.unknown?' (parcial)':''}`;
}
function renderPhotoItems(){
 $('#photo-result').innerHTML=`<h3>Confira sua refeição</h3><p class="help">Porções estimadas pela foto. Ajuste o peso se souber e confira a referência de cada alimento.</p>${editor.items.map((item,i)=>{
 const f=photoReference(item),candidates=state.foods.filter(saved=>saved.unit===item.reference.unit&&foodIdentity(item.reference.name).split(' ').some(w=>w.length>3&&foodIdentity(saved.name).split(' ').includes(w)));
 return `<section class="photo-item" data-index="${i}"><label class="photo-include"><input type="checkbox" name="photo-include" checked> ${escape(item.reference.name)}</label><p class="help">${escape(item.note||'Quantidade estimada visualmente.')}</p><label class="field">Referência<select name="photo-reference"><option value="">Nova estimativa da IA</option>${candidates.map(saved=>`<option value="${saved.id}" ${saved.id===item.foodId?'selected':''}>${escape(saved.name)} · cadastro salvo</option>`).join('')}</select></label><label class="field">Quantidade em ${escape(f.unit)}<input name="photo-quantity" type="number" min="0.001" max="100000" step="any" required value="${item.quantity}"></label></section>`;
 }).join('')}<p class="preview" id="photo-total"></p><button type="button" class="primary" data-photo-save>Registrar refeição</button>`;
 collectPhoto();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-act=photo]'))openPhoto();});
document.addEventListener('change',async e=>{
 if(e.target.matches('[data-photo-file]')){
  const context=editor,file=e.target.files[0];if(!file)return;
  context.photoRevision++;const photoRevision=context.photoRevision;$('#photo-analyze').disabled=true;$('#form-error').textContent='';
  try{const image=await compressedPhoto(file);if(editor!==context||context.photoRevision!==photoRevision)return;context.image=image;context.items=[];$('#photo-result').innerHTML='';$('#photo-preview').src=`data:image/jpeg;base64,${image.data}`;$('#photo-preview').hidden=false;$('#photo-analyze').disabled=false;}catch(error){if(editor===context)formError(error);}finally{e.target.value='';}
 }
 if(e.target.name==='photo-reference'){
  const item=editor.items[Number(e.target.closest('.photo-item').dataset.index)];item.foodId=e.target.value||null;collectPhoto();
 }
});
document.addEventListener('input',e=>{if(e.target.closest('.photo-item'))collectPhoto();});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='photo-form')return;e.preventDefault();const context=editor,button=$('#photo-analyze');if(!context.image||button.disabled)return;
 const photoRevision=context.photoRevision;context.meal=e.target.meal.value;button.disabled=true;button.textContent='Analisando foto…';$('#form-error').textContent='';$('#photo-result').innerHTML='';context.items=[];
 try{
  const result=await api('ai/photo',{image:context.image,description:e.target.description.value.trim()});if(editor!==context||context.photoRevision!==photoRevision)return;
  if(result.status!=='estimate'){$('#photo-result').innerHTML=`<p class="photo-question">${escape(result.question)}</p>`;e.target.description.focus();return;}
  context.items=result.items.map(i=>{
   const reference=normalizeFoodReference({...i,id:id(),favorite:false,confidence:'estimate',source:'Estimativa por foto, sem fonte verificada',sources:[]});
   const existing=sameFood(reference);return {reference,foodId:existing?.id||null,quantity:i.base,note:i.note,include:true};
  });renderPhotoItems();
 }catch(error){if(editor===context)formError(error);}finally{if(editor===context){button.disabled=false;button.textContent='Estimar novamente';}}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-photo-save]');if(!button||busy)return;
 try{
  collectPhoto();const included=editor.items.filter(i=>i.include);if(!included.length)throw Error('Selecione ao menos um alimento.');
  included.forEach(i=>FoodModel.num(i.quantity,.001));const meal=$('#photo-form').meal.value;
  button.disabled=true;
  if(await change(s=>{
   const day=dayIn(s);
   for(const item of included){
    let food=item.foodId?s.foods.find(f=>f.id===item.foodId):sameFood(item.reference,s.foods);
    if(!food){food=clone(item.reference);s.foods.push(food);}
    day.entries.push({id:id(),food:clone(food),quantity:item.quantity,meal});
   }
   day.complete=false;
  },'Refeição registrada'))closeEditor();
 }catch(error){formError(error);}finally{button.disabled=false;}
});
