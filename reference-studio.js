import {clone} from './model.js';
import {defaultReferenceRecipe,normalizeReferenceBox,referencePalette,validateReferenceRecipe} from './reference-data.js';
import {REFERENCE_VARIANTS,buildReferenceVariant} from './reference-layout.js';
import {createFrameRenderer} from './panorama-render.js';
import {panoramaFor} from './panorama.js';
import {REFERENCE_ROLES,referenceRoles} from './reference-sequence.js';

export function createReferenceStudio({getProject,getActive,images,onApply,onRecipe,notify}){
  const $=id=>document.getElementById(id),dialog=$('ref-studio'),board=$('ref-board'),measure=document.createElement('canvas').getContext('2d');
  let source=null,active=0,refId=null,recipe=null,mode='crop',chosen='match',job=0,timer=null,rendering=false,ready=new Map(),drafts=new Map(),drag=null;
  const reference=()=>source.references.find(r=>r.id===refId);
  function release(){for(const c of $('ref-variants').querySelectorAll('canvas'))c.width=c.height=1;}
  function selection(){
    for(const card of $('ref-variants').querySelectorAll('[data-ref-variant]')){const yes=card.dataset.refVariant===chosen;card.classList.toggle('selected',yes);card.querySelector('input').checked=yes;}
    const candidate=ready.get(chosen);$('apply-ref-variant').textContent=$('ref-scope').value==='set'?`Создать вариант · ${source.frames.length} ${source.frames.length===1?'кадр':source.frames.length<5?'кадра':'кадров'}`:'Создать вариант';$('apply-ref-variant').disabled=rendering||!candidate?.project||candidate.renderError;
  }
  function syncSettings(){
    for(const key of ['background','ink','accent','align','font','rotation','device'])$('ref-'+key).value=recipe[key];
    $('ref-use-colors').checked=recipe.useColors;for(const key of ['background','ink','accent'])$('ref-'+key).disabled=!recipe.useColors;
  }
  function sequenceSettings(){
    const set=$('ref-scope').value==='set',story=recipe.setLayout==='story';
    $('ref-set-settings').hidden=!set;$('ref-set-layout').value=recipe.setLayout;
    $('ref-role-settings').hidden=!story;
    const defaults=referenceRoles(source.frames.length),roles=referenceRoles(source.frames.length,recipe.roles);
    $('ref-set-hint').textContent=story?roles.map((r,i)=>`${i+1}. ${REFERENCE_ROLES.find(v=>v.id===r).name}`).join(' · '):'Одна разметка текста и телефона будет повторяться во всём комплекте.';
    const host=$('ref-role-list');host.replaceChildren();
    for(const [i,f] of source.frames.entries()){
      const label=document.createElement('label'),name=document.createElement('span');name.textContent=`${String(i+1).padStart(2,'0')} · ${f.sourceName}`;
      const select=document.createElement('select');select.setAttribute('aria-label',`Композиция кадра ${i+1}`);
      select.append(new Option(`Авто · ${REFERENCE_ROLES.find(r=>r.id===defaults[i]).name}`,'auto'));
      REFERENCE_ROLES.forEach(r=>select.append(new Option(r.name,r.id)));select.value=recipe.roles[i]??'auto';
      select.onchange=()=>{while(recipe.roles.length<=i)recipe.roles.push('auto');recipe.roles[i]=select.value;sequenceSettings();schedule();};
      label.append(name,select);host.append(label);
    }
  }
  function sampleColors(){
    const img=images.get(reference().image),c=document.createElement('canvas'),b=recipe.crop,ratio=img.width*b.w/(img.height*b.h);
    c.width=Math.max(1,Math.round(Math.min(160,240*ratio)));c.height=Math.max(1,Math.round(Math.min(240,160/ratio)));
    const g=c.getContext('2d');g.drawImage(img,img.width*b.x/100,img.height*b.y/100,img.width*b.w/100,img.height*b.h/100,0,0,c.width,c.height);
    const colors=referencePalette(g.getImageData(0,0,c.width,c.height));for(const key of ['background','ink','accent'])recipe[key]=colors[key];c.width=c.height=1;
    if(colors.empty)notify('В выбранной области нет непрозрачных цветов. Палитру можно задать вручную.');
    syncSettings();
  }
  function drawBoard(){
    if(!recipe)return;const img=images.get(reference().image),full=mode==='crop',crop=full?{x:0,y:0,w:100,h:100}:recipe.crop,ratio=img.width*crop.w/(img.height*crop.h);
    const w=Math.min(330,360*ratio),h=w/ratio;board.width=Math.max(1,Math.round(w*2));board.height=Math.max(1,Math.round(h*2));board.style.width=w+'px';
    const g=board.getContext('2d');g.scale(2,2);g.fillStyle='#e9edf5';g.fillRect(0,0,w,h);g.drawImage(img,img.width*crop.x/100,img.height*crop.y/100,img.width*crop.w/100,img.height*crop.h/100,0,0,w,h);
    for(const key of full?['crop']:['title','phone']){
      const b=recipe[key],color=key==='phone'?'#833dff':key==='title'?'#008fa7':'#2daa65';g.strokeStyle=color;g.lineWidth=key===mode?2:1;g.setLineDash(key===mode?[]:[4,3]);g.fillStyle=key===mode?color+'25':color+'10';
      g.fillRect(b.x*w/100,b.y*h/100,b.w*w/100,b.h*h/100);g.strokeRect(b.x*w/100,b.y*h/100,b.w*w/100,b.h*h/100);
    }
  }
  function fields(){
    const host=$('ref-box-fields');host.replaceChildren();
    for(const [key,title] of [['x','X, %'],['y','Y, %'],['w','Ширина, %'],['h','Высота, %']]){
      const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='number';input.min=['w','h'].includes(key)?2:0;input.max=100;input.step=.5;input.value=Number(recipe[mode][key].toFixed(1));input.dataset.refBox=key;label.append(input);host.append(label);
    }
  }
  function setMode(value){
    mode=value;for(const b of dialog.querySelectorAll('[data-ref-zone]'))b.setAttribute('aria-pressed',String(b.dataset.refZone===mode));
    $('ref-zone-hint').textContent=mode==='crop'?'Выдели один кадр из подборки. Если он уже один — оставь целиком.':mode==='title'?'Отметь общий блок заголовка и подзаголовка.':'Отметь область телефона. Его пропорции сохранятся.';
    fields();drawBoard();
  }
  async function refresh(){
    clearTimeout(timer);const token=++job;rendering=true;ready=new Map();release();const list=$('ref-variants');list.replaceChildren();$('ref-progress').textContent='Готовим варианты с твоими экранами…';
    for(const variant of REFERENCE_VARIANTS){
      const card=document.createElement('article');card.className='ref-variant';card.dataset.refVariant=variant.id;
      const heading=document.createElement('label'),radio=document.createElement('input'),name=document.createElement('strong'),description=document.createElement('p');radio.type='radio';radio.name='reference-variant';radio.value=variant.id;radio.onchange=()=>{chosen=variant.id;selection();};name.textContent=variant.name;description.textContent=$('ref-scope').value==='set'&&recipe.setLayout==='story'?{match:'Разные композиции, палитра и отступы по референсу.',focus:recipe.useColors?'Та же последовательность на светлом фоне.':'Та же последовательность с лёгким наклоном телефонов.',angle:'Та же последовательность с другими ракурсами.'}[variant.id]:(recipe.useColors?variant.description:{match:'Выбранные области и твоя палитра.',focus:'Крупнее телефон, твоя палитра.',angle:'Выразительный ракурс, твоя палитра.'}[variant.id]);heading.append(radio,name);card.append(heading,description);
      const strip=document.createElement('div');strip.className='ref-preview-strip';card.append(strip);
      let candidate;
      try{candidate=buildReferenceVariant(source,{referenceId:refId,recipe,variant:variant.id,scope:$('ref-scope').value,active},images,measure);candidate.renderError=false;}
      catch(error){candidate={error:error.message};}
      const warning=document.createElement('p');warning.className='ref-variant-warning';warning.textContent=candidate.error??candidate.warnings.join(' ');warning.hidden=!warning.textContent;card.append(warning);list.append(card);ready.set(variant.id,candidate);
      if(candidate.project)for(const id of candidate.previewIds){
        const button=document.createElement('button');button.type='button';button.className='ref-preview';button.setAttribute('aria-label',`Выбрать «${variant.name}», кадр ${source.frames.findIndex(f=>f.id===id)+1}`);button.onclick=()=>{chosen=variant.id;selection();};
        const canvas=document.createElement('canvas');canvas.dataset.refFrame=id;canvas.setAttribute('aria-hidden','true');const caption=document.createElement('span');const composition=candidate.compositions.find(v=>v.frameId===id);caption.textContent=`${String(composition.index+1).padStart(2,'0')} · ${composition.name}`;button.append(canvas,caption);strip.append(button);
      }
    }
    selection();
    for(const variant of REFERENCE_VARIANTS){
      const candidate=ready.get(variant.id);if(!candidate.project)continue;const card=list.querySelector(`[data-ref-variant="${variant.id}"]`),draw=createFrameRenderer(candidate.project,images);let textWarning=false;
      for(const canvas of card.querySelectorAll('canvas')){
        await new Promise(resolve=>requestAnimationFrame(resolve));if(token!==job||!dialog.open)return;
        try{const result=draw(canvas,candidate.project.frames.find(f=>f.id===canvas.dataset.refFrame),$('ref-preview-format').value,.38);candidate.renderError||=result.errors.length>0;textWarning||=result.warnings?.length>0;}
        catch{candidate.renderError=true;}
      }
      const warning=card.querySelector('.ref-variant-warning');
      if(candidate.renderError){warning.textContent='3D не удалось отрисовать. Выбери обычную рамку или перезапусти 3D в редакторе.';warning.hidden=false;}
      else if(textWarning){warning.textContent+=(warning.textContent?' ':'')+'Некоторые текстовые блоки выходят за край. Их можно поправить после применения.';warning.hidden=false;}
    }
    if(token!==job||!dialog.open)return;rendering=false;selection();$('ref-progress').textContent=`Превью ${$('ref-preview-format').value.replace('x',' × ')}. Выбери вариант — он откроется отдельной версией.`;
  }
  function schedule(){job++;rendering=true;ready.clear();selection();$('ref-progress').textContent='Обновляем варианты…';clearTimeout(timer);timer=setTimeout(refresh,180);}
  function loadReference(id){
    if(refId&&recipe)drafts.set(refId,clone(recipe));refId=id;const saved=drafts.get(id)??reference().recipe;recipe=saved?validateReferenceRecipe(saved):defaultReferenceRecipe();
    if(!saved)sampleColors();syncSettings();sequenceSettings();setMode('crop');refresh();
  }
  function open(id){
    source=clone(getProject());active=getActive();const ref=source.references.find(r=>r.id===id);if(!ref||!images.has(ref.image))return notify('Сначала прикрепи референс.');
    refId=null;recipe=null;drafts=new Map();chosen='match';$('ref-scope').value=source.frames.length>1?'set':'current';$('ref-preview-format').value=source.format;$('ref-scope').options[0].textContent=panoramaFor(source,source.frames[active].id)?'Текущей панораме · 2 кадра':'Текущему кадру';
    const select=$('ref-choice');select.replaceChildren();for(const r of source.references){const o=document.createElement('option');o.value=r.id;o.textContent=r.name;select.append(o);}select.value=id;dialog.showModal();loadReference(id);
  }
  function pointer(e){const r=board.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))};}
  board.addEventListener('pointerdown',e=>{if(e.button>0||!recipe)return;e.preventDefault();board.focus({preventScroll:true});board.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:pointer(e),before:clone(recipe[mode]),changed:false};});
  board.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=pointer(e),a=drag.start;if(Math.hypot(p.x-a.x,p.y-a.y)<1)return;drag.changed=true;recipe[mode]=normalizeReferenceBox({x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)});fields();drawBoard();});
  function finish(e){if(!drag||drag.id!==e.pointerId)return;const changed=drag.changed;if(e.type==='pointercancel')recipe[mode]=drag.before;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);drag=null;if(changed){if(mode==='crop')sampleColors();fields();drawBoard();schedule();}}
  board.addEventListener('pointerup',finish);board.addEventListener('pointercancel',finish);
  board.addEventListener('keydown',e=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d||!recipe)return;e.preventDefault();const b=recipe[mode],step=e.shiftKey?5:1;recipe[mode]=normalizeReferenceBox({...b,x:Math.max(0,Math.min(100-b.w,b.x+d[0]*step)),y:Math.max(0,Math.min(100-b.h,b.y+d[1]*step))});if(mode==='crop')sampleColors();fields();drawBoard();schedule();});
  $('ref-box-fields').addEventListener('input',e=>{const key=e.target.dataset.refBox,n=Number(e.target.value);if(!key||e.target.value===''||!Number.isFinite(n))return;recipe[mode]=normalizeReferenceBox({...recipe[mode],[key]:n});drawBoard();schedule();});
  $('ref-box-fields').addEventListener('change',()=>{if(mode==='crop')sampleColors();fields();drawBoard();schedule();});
  for(const b of dialog.querySelectorAll('[data-ref-zone]'))b.onclick=()=>setMode(b.dataset.refZone);
  $('ref-reset-zones').onclick=()=>{const d=defaultReferenceRecipe();recipe.title=d.title;recipe.phone=d.phone;fields();drawBoard();schedule();};
  $('ref-sample-colors').onclick=()=>{sampleColors();schedule();};
  for(const key of ['background','ink','accent','align','font','device'])$('ref-'+key).addEventListener('input',e=>{recipe[key]=e.target.value;schedule();});
  $('ref-rotation').oninput=e=>{const value=Number(e.target.value);if(e.target.value===''||!Number.isFinite(value))return;recipe.rotation=Math.max(-30,Math.min(30,value));schedule();};
  $('ref-use-colors').onchange=e=>{recipe.useColors=e.target.checked;syncSettings();schedule();};
  $('ref-choice').onchange=e=>loadReference(e.target.value);$('ref-scope').onchange=()=>{sequenceSettings();schedule();};
  $('ref-set-layout').onchange=e=>{recipe.setLayout=e.target.value;sequenceSettings();schedule();};
  $('ref-reset-roles').onclick=()=>{recipe.roles=[];sequenceSettings();schedule();};
  $('ref-preview-format').onchange=schedule;
  $('save-ref-recipe').onclick=()=>{const clean=validateReferenceRecipe(recipe);reference().recipe=clone(clean);onRecipe(refId,clean);notify('Разметка сохранена в проекте. «Сохранить проект» запишет её в файл.');};
  $('apply-ref-variant').onclick=()=>{const result=ready.get(chosen);if(rendering||!result?.project||result.renderError)return;try{onApply(result.project);dialog.close();notify('Новая версия открыта. Предыдущее оформление сохранено в «Версиях комплекта».');}catch(error){$('ref-progress').textContent=error.message;}};
  $('close-ref-studio').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{job++;clearTimeout(timer);release();ready.clear();source=recipe=refId=drag=null;drafts.clear();board.width=board.height=1;});
  return {open};
}
