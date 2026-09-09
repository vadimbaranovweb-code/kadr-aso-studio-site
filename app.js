import {FORMATS,LAYOUT_FIELDS,PALETTES,clone,clamp,uid,defaultFrame,deviceLayer,textLayer,graphicLayer,cropLayer,applyComposition,applyPalette,validateProject,History} from './model.js';
import {drawFrame,drawPhoneOnly,pointInPolygon} from './render.js';
import {isPhone3D,enablePhone3D,wrapAngle,poseOf} from './phone-data.js';
import {resetPhoneRenderer} from './phone-renderer.js';
import {createDemoImage} from './demo.js';
import {inspectorHTML} from './inspector.js';
import {makeZip} from './zip.js';
import {createTemplateGallery} from './template-gallery.js';
import {panoramaFor,panoramaScene,joinFrames,restoreSeparateFrames,frameUnits,moveFrameUnit,duplicateFrameUnit,removeFrameUnit} from './panorama.js';
import {createFrameRenderer} from './panorama-render.js';
import {resolveLayer,resolveScene,layoutPatch,writeLayerPatch,correctedLayers,clearFormatCorrections} from './layout.js';
import {createReferenceStudio} from './reference-studio.js';
import {createTextEditor} from './text-editor.js';
import {createRecoveryStore} from './recovery-store.js';
import {createAutosave} from './autosave.js';
import {createVersionsDialog} from './versions-dialog.js';
import {versionLabel,nextVersionName,createProjectVersion} from './project-versions.js';
import {createScreenBatchDialog} from './screen-batch-dialog.js';
import {createLocalizationDialog} from './localization-dialog.js';
import {activeLocale,localeLabel} from './localization.js';
import {createCanvasViewport} from './canvas-viewport.js';
import {createExportDialog} from './export-dialog.js';

const $=id=>document.getElementById(id);
let project={app:'kadr-aso',version:5,name:'Мой первый комплект',format:'414x896',exportScale:2,exportBothFormats:false,frames:[],references:[],savedPoses:[],panoramas:[]};
let active=0,selectedId=null,dirty=false,busy=false,toastTimer,renderRequest,thumbTimer,dragDepth=0,geometry={layers:[]},drag=null,cropRequest=null,replaceGraphicId=null;
const images=new Map(),history=new History(40),measure=document.createElement('canvas').getContext('2d');
let editScope='all',editorMode='express',expressStep=1;
let panoEditing=false,replaceSourceId=null,rotate3D=false,replaceDeviceId=null,replaceDeviceFrameId=null;
const current=()=>project.frames[active];
const pair=()=>current()?panoramaFor(project,current().id):null;
const working=()=>pair()??current();
const scene=()=>pair()?panoramaScene(project,pair()):current();
const viewOnly=()=>Boolean(pair()&&!panoEditing);
const displayLayer=(l,s=scene())=>resolveLayer(l,s,images,project.format,measure);
const selected=()=>{const l=working()?.layers.find(l=>l.id===selectedId);return !viewOnly()&&l?displayLayer(l):null;};
const maxX=()=>pair()?300:200;
const canvasViewport=createCanvasViewport({getSize:()=>[geometry.width??FORMATS[project.format][0],geometry.height??FORMATS[project.format][1]],onPanStart:()=>finishDrag()});
const sourceFor=l=>l?.image??(pair()?project.frames.find(f=>f.id===pair().frameIds[l?.sourceSide??0]).image:current().image);
function enterPanorama(){panoEditing=Boolean(pair());selectedId=null;rotate3D=false;afterEdit();autosave.changed();}
function editorView(){return {active,panoEditing,editScope,editorMode,selectedIndex:working()?.layers.findIndex(l=>l.id===selectedId)??-1};}
function restoreEditorView(view={}){
  active=Number.isInteger(view.active)?clamp(view.active,0,project.frames.length-1):0;
  panoEditing=Boolean(view.panoEditing&&pair());editScope=view.editScope==='format'?'format':'all';
  selectedId=Number.isInteger(view.selectedIndex)?working().layers[view.selectedIndex]?.id??null:null;rotate3D=false;
  if(['express','pro'].includes(view.editorMode))editorMode=view.editorMode;
  $('format').value=project.format;$('edit-scope').value=editScope;
}
function applyGeneratedVersion(next,kind,view){
  const result=createProjectVersion(project,nextVersionName(project,kind),editorView(),next,view);
  edit(()=>{project=result.project;restoreEditorView(result.view);});history.end();afterEdit();renderReferences();
}

const templates=createTemplateGallery({getProject:()=>project,getActive:()=>active,images,notify,
  onVariant:next=>applyGeneratedVersion(next,'Шаблон',{active:0,panoEditing:false,selectedIndex:-1,editScope}),
  onFrame:next=>{edit(()=>{next.id=current().id;project.frames[active]=next;selectedId=null;rotate3D=false;});afterEdit();}
});
const referenceStudio=createReferenceStudio({getProject:()=>project,getActive:()=>active,images,notify,
  onApply:next=>applyGeneratedVersion(next,'Референс',{...editorView(),selectedIndex:-1}),
  onRecipe:(id,recipe)=>{edit(()=>{const r=project.references.find(v=>v.id===id);if(r)r.recipe=recipe;});renderReferences();}
});
const textEditor=createTextEditor({getProject:()=>project,images,notify,onApply:(next,focus,count)=>{
  if(count||next.format!==project.format)edit(()=>{project=next;},null,!count);
  if(focus){editorMode='pro';active=Math.max(0,project.frames.findIndex(f=>f.id===focus.frameId));panoEditing=focus.panorama;selectedId=focus.layerId;rotate3D=false;if(focus.layerId)setTab('layers');requestAnimationFrame(()=>$('preview').focus());}
  $('format').value=project.format;history.end();afterEdit();if(focus)autosave.changed();
}});
const versionsDialog=createVersionsDialog({getProject:()=>project,getView:editorView,notify,canUndo:()=>Boolean(history.past.length),onUndo:undo,
  onApply:async(next,view,base)=>{
    try{await loadProjectImages(next);}catch(error){collectImages();throw error;}if(project!==base)throw new Error('Проект изменился во время открытия версии. Попробуй ещё раз.');
    history.end();edit(()=>{project=next;restoreEditorView(view);},null,true);history.end();$('project-name').value=project.name;afterEdit();renderReferences();collectImages();
  },
  onDownload:(single,label)=>{const payload=JSON.stringify(single);if(payload.length>210*1024*1024)throw new Error('Версия больше 210 МБ. Уменьши изображения перед скачиванием.');download(new Blob([payload],{type:'application/json'}),`${safeName(project.name)}-${safeName(label)}.kadr.json`);notify('Выбранная версия подготовлена к скачиванию отдельным проектом.');}
});
const screenBatch=createScreenBatchDialog({getProject:()=>project,getView:editorView,readScreenshot,images,notify,onClose:collectImages,
  onApply:async(next,view,base)=>{
    if(project!==base)throw new Error('Проект изменился. Открой замену заново.');
    history.end();edit(()=>{project=next;restoreEditorView(view);});history.end();afterEdit();renderReferences();
  }
});
const exportDialog=createExportDialog({getProject:()=>project,getFrameId:()=>current().id,onRun:prepareDownload,
  onReview:()=>localizationDialog.open(),
  onPreferences:options=>{if(project.exportScale!==options.scale||project.exportBothFormats!==(options.format==='both')){edit(()=>{project.exportScale=options.scale;project.exportBothFormats=options.format==='both';},null,true);afterEdit();}}
});
const localizationDialog=createLocalizationDialog({getProject:()=>project,getView:editorView,loadImages:loadProjectImages,images,download,notify,onClose:collectImages,
  onApply:async(next,view,base)=>{try{await loadProjectImages(next);}catch(e){collectImages();throw e;}if(project!==base)throw new Error('Проект изменился. Открой локализацию заново.');history.end();edit(()=>{project=next;restoreEditorView(view);},null,true);history.end();afterEdit();renderReferences();},
  onUI:()=>screenBatch.open(),onExport:codes=>exportDialog.open({scope:'languages',codes}),
  onCanvas:(id,format)=>{editorMode='pro';active=Math.max(0,project.frames.findIndex(f=>f.id===id));panoEditing=Boolean(pair());selectedId=null;rotate3D=false;if(project.format!==format)edit(()=>project.format=format,null,true);$('format').value=format;afterEdit();autosave.changed();}
});
const autosave=createAutosave({store:createRecoveryStore(),getSnapshot:()=>({project,needsFileSave:dirty,view:editorView()}),onState:renderAutosaveState,
  restore:async snapshot=>{
    const next=snapshot.project;await loadProjectImages(next);project=next;
    editorMode=snapshot.view?.editorMode==='express'?'express':'pro';restoreEditorView(snapshot.view);
    dirty=snapshot.needsFileSave!==false;rotate3D=false;history.clear();$('save-status').textContent=dirty?'Восстановлена резервная копия · сохрани проект в файл':'Восстановлена резервная копия проекта';
  }
});
function renderAutosaveState(state){
  const error=['error','conflict'].includes(state.status),replace=state.mode==='load'||state.status==='conflict',waiting=['loading','saving'].includes(state.status);
  const labels={loading:'Открываем резервную копию…',idle:'Автосохранение включено',pending:'Изменения ожидают сохранения',saving:'Сохраняем в браузере…',saved:'Сохранено в браузере',error:state.mode==='load'?'Копия не восстановлена':'Автосохранение не удалось',conflict:'Автосохранение приостановлено'};
  $('autosave-status').textContent=labels[state.status];$('autosave-status').classList.toggle('is-error',error);
  $('versions-save-status').textContent=labels[state.status];$('versions-save-status').classList.toggle('is-error',error);
  $('autosave-detail').textContent=error?(state.mode==='load'?'Не удалось восстановить копию. Сохранённые данные не заменены. ':'')+state.error:state.status==='idle'?'Резервная копия появится после первой правки.':labels[state.status]+'.';
  $('autosave-time').textContent=state.savedAt?`Последняя успешная запись: ${new Date(state.savedAt).toLocaleString('ru-RU')}`:'';
  $('autosave-time').hidden=!state.savedAt;$('autosave-detail').classList.toggle('is-error',error);
  $('autosave-retry').hidden=!(error&&!replace);$('autosave-use-current').hidden=!(error&&replace);$('autosave-replace-note').hidden=!(error&&replace);
  $('autosave-now').hidden=error;$('autosave-now').disabled=waiting||(state.status==='saved'&&!state.pending);
  $('autosave-retry').disabled=waiting;$('autosave-use-current').disabled=waiting;
}
const safeName=s=>s.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,60)||'aso-project';
const exportName=()=>safeName(project.name)+(project.versions?' — '+safeName(versionLabel(project)):'')+(project.localization?' — '+activeLocale(project):'');
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4300);}
function markDirty(preserveLocaleReview=false){if(project.localization&&!preserveLocaleReview){project.localization.active.reviewed=false;if(project.localization.active.code===project.localization.source)project.localization.revision=(project.localization.revision??0)+1;}dirty=true;$('save-status').textContent='Есть изменения после последнего скачивания';updateHistoryButtons();autosave.changed();}
function updateHistoryButtons(){$('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;}
function edit(fn,group=null,preserveLocaleReview=false){history.record(project,group);const before=project;fn();localizationDialog.adoptVersions(before,project);markDirty(preserveLocaleReview);scheduleRender();}
function changeLayer(l,fn,group=null){
  const next=clone(l);fn(next);const patch=layoutPatch(l,next),raw=working().layers.find(v=>v.id===l.id);
  if(raw&&Object.keys(patch).length)edit(()=>writeLayerPatch(raw,patch,scene(),images,project.format,editScope,measure),group);
}
function applySceneChanges(next){
  const base=working();for(const l of next.layers){const raw=base.layers.find(v=>v.id===l.id);if(raw)writeLayerPatch(raw,layoutPatch(displayLayer(raw),l),scene(),images,project.format,editScope,measure);else base.layers.push({...l,layoutFormat:project.format,formatOverrides:{}});}
  base.composition=next.composition;
}
function afterEdit(){renderInspector();renderLayers();renderFrames();render();}
async function loadImage(source){
  if(images.has(source))return images.get(source);
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Не удалось открыть изображение. Попробуй PNG или JPG.'));i.src=source;});
  if(!img.width||!img.height||img.width*img.height>50000000)throw new Error('Используй изображение до 50 мегапикселей.');images.set(source,img);return img;
}
async function loadProjectImages(next){for(const f of next.frames){await loadImage(f.image);for(const l of f.layers)if(l.image)await loadImage(l.image);}for(const p of next.panoramas??[])for(const l of p.layers)if(l.image)await loadImage(l.image);for(const r of next.references)await loadImage(r.image);}
function collectImages(){
  const used=new Set();
  for(const p of [project,...history.past,...history.future]){for(const f of p.frames){used.add(f.image);f.layers.forEach(l=>{if(l.image)used.add(l.image);});}for(const pair of p.panoramas??[])pair.layers.forEach(l=>{if(l.image)used.add(l.image);});p.references.forEach(r=>used.add(r.image));}
  for(const key of images.keys())if(!used.has(key))images.delete(key);
}
function render(){
  if(!current()||!images.has(current().image))return;
  geometry=panoEditing&&pair()?drawFrame($('preview'),scene(),images,project.format,2):createFrameRenderer(project,images)($('preview'),current(),project.format,2);
  $('render-error').hidden=!geometry.errors.length;
  $('render-error-text').textContent=geometry.errors[0]?.message??'';
  $('active-label').textContent=`Кадр ${String(active+1).padStart(2,'0')}`;
  const linked=pair()&&selected()?scene().sources[selected().sourceSide??0]:null;
  $('source-status').textContent=selected()?.image&&selected()?.type==='device'?selected().sourceName:linked?linked.name:current().demo?'Демонстрационный интерфейс':current().sourceName;
  $('bg-swatch').style.background=working().background;
  $('export-both').checked=Boolean(project.exportBothFormats);
  $('active-version-label').textContent=versionLabel(project);
  $('active-locale-label').textContent=localeLabel(activeLocale(project));
  updatePanoramaUI();updateResizeUI();updateSelection();updateHistoryButtons();
  renderMode();canvasViewport.update();
  clearTimeout(thumbTimer);thumbTimer=setTimeout(renderThumbs,150);
}
function renderThumbs(){const draw=createFrameRenderer(project,images);for(const [i,f] of project.frames.entries()){const c=document.querySelector(`[data-thumb="${i}"]`);if(c)draw(c,f,project.format,.25);}}
function scheduleRender(){cancelAnimationFrame(renderRequest);renderRequest=requestAnimationFrame(render);}
function renderMode(){
  const fast=editorMode==='express';document.body.dataset.mode=editorMode;
  $('mode-express').setAttribute('aria-pressed',String(fast));$('mode-pro').setAttribute('aria-pressed',String(!fast));
  $('express-panel').hidden=!fast;
  $('preview').setAttribute('aria-label',fast?'Предпросмотр кадра. Для редактирования переключись в Pro.':'Холст. Выбери слой мышью или в панели слоёв. Стрелки перемещают выбранный слой.');
  if(fast){
    setTab('frames');
    $('express-screens-status').textContent=`Кадров: ${project.frames.length} из 6${project.frames.some(f=>f.demo)?' · есть демонстрационный экран':''}`;
    $('express-add').disabled=project.frames.length>=6;
    $('express-style').disabled=Boolean(project.panoramas?.length);
    $('express-panorama-note').hidden=!project.panoramas?.length;
    $('express-export-summary').textContent=`${project.frames.length} кадров · ${localeLabel(activeLocale(project))} · ${versionLabel(project)}`;
    $('express-step-caption').textContent=`Шаг ${expressStep} из 4`;
    document.querySelectorAll('[data-express-pane]').forEach(e=>e.hidden=Number(e.dataset.expressPane)!==expressStep);
    document.querySelectorAll('[data-express-step]').forEach(e=>{if(Number(e.dataset.expressStep)===expressStep)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
    $('express-back').disabled=expressStep===1;
    $('express-next').classList.toggle('primary',expressStep===4);
    $('express-next').textContent=expressStep===4?'Экспорт…':`Далее · ${['','', 'Стиль','Тексты','Экспорт'][expressStep+1]}`;

  }
}
function setMode(mode){
  if(busy||!current())return;finishDrag();history.end();editorMode=mode;rotate3D=false;
  afterEdit();autosave.changed();
}
function updateSelection(){
  const l=selected(),g=geometry.layers.find(g=>g.id===selectedId),box=$('selection');
  const canRotate=editorMode==='pro'&&isPhone3D(l)&&!l.locked;
  $('rotate-3d').hidden=!canRotate;$('rotate-3d').setAttribute('aria-pressed',String(canRotate&&rotate3D));
  $('rotate-3d').textContent=rotate3D?'Вращение 3D включено':'Вращать 3D';
  $('preview').classList.toggle('rotating-3d',canRotate&&rotate3D);
  if(editorMode==='express'||!l||!g||l.locked){box.hidden=true;$('interaction-hint').textContent=editorMode==='express'?'Express · для правок на холсте перейди в Pro':l?.locked?'Слой заблокирован':'Выбери объект на холсте';return;}
  box.hidden=false;box.style.left=g.bounds.x/geometry.width*100+'%';box.style.top=g.bounds.y/geometry.height*100+'%';box.style.width=g.bounds.w/geometry.width*100+'%';box.style.height=g.bounds.h/geometry.height*100+'%';
  $('selection-label').textContent=l.name;$('interaction-hint').textContent=canRotate&&rotate3D?'Перетащи для поворота в 3D · стрелки — точный ракурс':'Перетащи · угол — размер · круг — поворот';
}
function selectLayer(id,switchTab=true){const enter=Boolean(pair()&&id&&!panoEditing);if(enter)panoEditing=true;selectedId=id;if(enter){render();renderFrames();}if(switchTab&&id)setTab('layers');history.end();renderInspector();renderLayers();updateSelection();autosave.changed();}
function renderInspector(){$('inspector-content').innerHTML=inspectorHTML(resolveScene(scene(),images,project.format,measure),selected(),project,{viewOnly:viewOnly(),editScope});}
function makeButton(symbol,label,handler){const b=document.createElement('button');b.type='button';b.className='icon-button';b.textContent=symbol;b.title=label;b.setAttribute('aria-label',label);b.onclick=handler;return b;}
function renderFrames(){
  const list=$('frame-list');list.replaceChildren();const units=frameUnits(project);
  project.frames.forEach((f,i)=>{
    const p=panoramaFor(project,f.id),unitIndex=units.findIndex(u=>u.frames.includes(f)),unit=units[unitIndex];
    const item=document.createElement('div');item.className='frame-item';
    const selected=i===active||Boolean(panoEditing&&p&&p.id===pair()?.id);
    const b=document.createElement('button');b.className='frame-select'+(selected?' selected':'');b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',`Кадр ${i+1}: ${f.sourceName}`);
    const c=document.createElement('canvas');c.dataset.thumb=i;c.setAttribute('aria-hidden','true');
    const cap=document.createElement('span');cap.className='frame-caption';const title=document.createElement('strong');title.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.textContent=p?'Панорама':f.demo?'Пример':f.sourceName;cap.append(title,name);b.append(c,cap);
    b.onclick=()=>{active=i;panoEditing=false;selectedId=null;history.end();afterEdit();autosave.changed();};item.append(b);
    const actions=document.createElement('div');actions.className='frame-actions';
    const up=makeButton('↑',p?'Панораму раньше':'Кадр раньше',()=>moveFrame(i,-1));up.disabled=unitIndex===0;
    const down=makeButton('↓',p?'Панораму позже':'Кадр позже',()=>moveFrame(i,1));down.disabled=unitIndex===units.length-1;
    const duplicate=makeButton('⧉',p?'Дублировать панораму (2 кадра)':'Дублировать кадр',()=>{edit(()=>{const id=duplicateFrameUnit(project,i);active=project.frames.findIndex(f=>f.id===id);selectedId=null;panoEditing=Boolean(p);});afterEdit();});duplicate.disabled=project.frames.length+unit.frames.length>6;
    const remove=makeButton('×',p?'Удалить панораму (2 кадра)':'Удалить кадр',()=>{edit(()=>{removeFrameUnit(project,i);active=Math.min(active,project.frames.length-1);selectedId=null;panoEditing=false;});afterEdit();notify(p?'Пара удалена. «Отменить» вернёт её.':'Кадр удалён. Его можно вернуть кнопкой «Отменить».');});remove.disabled=units.length===1;
    actions.append(up,down,duplicate,remove);item.append(actions);list.append(item);
  });
  $('frame-count').textContent=`${project.frames.length} / 6`;$('add-screens').disabled=project.frames.length>=6;renderThumbs();
}
function moveFrame(index,delta){const activeId=current().id;edit(()=>{moveFrameUnit(project,index,delta);active=project.frames.findIndex(f=>f.id===activeId);});afterEdit();}
function renderLayers(){
  const list=$('layer-list');list.replaceChildren();
  [...working().layers].reverse().forEach(l=>{
    const row=document.createElement('div');row.className='layer-row'+(l.id===selectedId?' selected':'')+(!l.visible?' is-hidden':'');
    const b=document.createElement('button');b.className='layer-main';b.setAttribute('aria-pressed',String(l.id===selectedId));const icon=document.createElement('span');icon.className='layer-symbol';icon.textContent={text:'T',device:'▯',crop:'⌗',image:'▧'}[l.type];icon.setAttribute('aria-hidden','true');const name=document.createElement('span');name.textContent=l.name;b.append(icon,name);b.onclick=()=>selectLayer(l.id,false);
    const visibility=makeButton(l.visible?'◉':'○',l.visible?'Скрыть слой':'Показать слой',()=>{edit(()=>l.visible=!l.visible);renderLayers();if(l.id===selectedId)renderInspector();});
    const lock=makeButton(l.locked?'●':'◇',l.locked?'Разблокировать слой':'Заблокировать слой',()=>{edit(()=>l.locked=!l.locked);renderLayers();if(l.id===selectedId)renderInspector();});
    row.append(b,visibility,lock);list.append(row);
  });
}
function setTab(name){if(editorMode==='express')name='frames';for(const key of ['frames','layers']){$(`tab-${key}`).setAttribute('aria-selected',String(key===name));$(`tab-${key}`).tabIndex=key===name?0:-1;$(`${key}-pane`).hidden=key!==name;}}
document.querySelectorAll('[data-tab]').forEach(b=>{b.onclick=()=>setTab(b.dataset.tab);b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=editorMode==='express'?'frames':b.dataset.tab==='frames'?'layers':'frames';setTab(next);$(`tab-${next}`).focus();}};});
function showDesign(){if(viewOnly())return enterPanorama();selectLayer(null,false);}
function addLayer(layer,duplicate=false){if(working().layers.length>=(pair()?48:24))return notify(pair()?'В панораме уже 48 слоёв.':'В кадре уже 24 слоя.');if(!duplicate){layer.layoutFormat=project.format;layer.formatOverrides={};}if(pair()){panoEditing=true;layer.sourceSide??=pair().frameIds.indexOf(current().id);if(!duplicate&&layer.x<50)layer.x+=50;}edit(()=>working().layers.push(layer));selectLayer(layer.id);render();}
function addText(){const l=textLayer();l.y=40;l.fontSize=30;l.color=working().layers.find(l=>l.type==='text')?.color??'#ffffff';addLayer(l);}
function addPhone(){const l=enablePhone3D(deviceLayer());l.name='iPhone 17';l.width=62;l.x=20;l.y=30;addLayer(l);}
function enablePrimaryPhone(){
  if(pair())panoEditing=true;
  let l=working().layers.find(l=>l.type==='device'&&!l.locked);
  if(!l){addPhone();return;}
  changeLayer(displayLayer(l),v=>{enablePhone3D(v);v.name='iPhone 17';});selectLayer(l.id);render();
}
function removeLayer(){const l=selected();if(!l||l.locked)return;edit(()=>{working().layers=working().layers.filter(v=>v.id!==l.id);selectedId=null;});afterEdit();}
function duplicateLayer(){const l=selected();if(!l||l.locked)return;const copy=clone(working().layers.find(v=>v.id===l.id));copy.id=uid();copy.name=(copy.name+' · копия').slice(0,100);copy.x=clamp(copy.x+3,-200,maxX());copy.y=clamp(copy.y+2,-200,200);for(const correction of Object.values(copy.formatOverrides??{})){if('x' in correction)correction.x=clamp(correction.x+3,-200,maxX());if('y' in correction)correction.y=clamp(correction.y+2,-200,200);}addLayer(copy,true);}
function reorderLayer(delta){const l=selected();if(!l||l.locked)return;const index=working().layers.findIndex(v=>v.id===l.id),to=index+delta;if(to<0||to>=working().layers.length)return;edit(()=>{const [raw]=working().layers.splice(index,1);working().layers.splice(to,0,raw);});afterEdit();}
function undo(){const next=history.undo(project);if(next)restoreHistory(next);}
function redo(){const next=history.redo(project);if(next)restoreHistory(next);}
function restoreHistory(next){const oldFrame=current().id,oldLayer=selectedId;project=next;panoEditing=panoEditing&&Boolean(panoramaFor(project,oldFrame));active=Math.max(0,project.frames.findIndex(f=>f.id===oldFrame));selectedId=working().layers.some(l=>l.id===oldLayer)?oldLayer:null;$('project-name').value=project.name;$('format').value=project.format;markDirty(true);afterEdit();renderReferences();collectImages();}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
async function task(label,fn){if(busy)return;busy=true;$('busy-label').textContent=label;$('busy').hidden=false;try{await fn();}catch(e){notify(e.message||'Не получилось выполнить действие. Попробуй ещё раз.');}finally{busy=false;$('busy').hidden=true;collectImages();}}
async function readScreenshot(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Поддерживаются PNG, JPG и WebP.');
  if(file.size>12*1024*1024)throw new Error('Одно изображение должно быть не больше 12 МБ.');
  const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать файл.'));r.readAsDataURL(file);});
  const img=await loadImage(image);if(img.width<16||img.height<16)throw new Error('Изображение слишком маленькое: минимум 16 × 16 px.');
  return {image,sourceName:file.name.slice(0,200),demo:false};
}
async function addScreens(files,replace=false){
  if(!files.length)return;
  await task('Открываем экраны…',async()=>{
    const demoOnly=project.frames.length===1&&current().demo&&!working().layers.some(l=>l.type==='device'&&l.image),capacity=replace?1:6-(demoOnly?0:project.frames.length);
    if(capacity<1)throw new Error('В комплекте уже 6 кадров. Можно заменить существующий.');
    const parsed=[];for(const file of Array.from(files).slice(0,capacity))parsed.push(await readScreenshot(file));
    edit(()=>{
      if(replace){const target=project.frames.find(f=>f.id===replaceSourceId)??current();Object.assign(target,parsed[0]);replaceSourceId=null;}
      else{const base=clone(current());if(demoOnly)project.frames=[];active=project.frames.length;for(const src of parsed){const f=clone(base);Object.assign(f,src,{id:uid()});f.layers.forEach(l=>l.id=uid());project.frames.push(f);}selectedId=null;panoEditing=false;}
    });afterEdit();notify(replace?'Экран заменён. Проверь вырезки UI.':`Добавлено экранов: ${parsed.length}${files.length>capacity?' · достигнут лимит комплекта':''}`);
  });
}
async function addGraphic(file){if(!file)return;await task('Открываем графику…',async()=>{const src=await readScreenshot(file);const l=working().layers.find(l=>l.id===replaceGraphicId&&l.type==='image');if(l){edit(()=>{l.image=src.image;l.name=src.sourceName.slice(0,100);});afterEdit();}else addLayer(graphicLayer(src.image,src.sourceName));replaceGraphicId=null;});}
async function replaceDeviceImage(file){
  if(!file)return;
  await task('Открываем экран телефона…',async()=>{
    const frame=[...project.frames,...(project.panoramas??[])].find(f=>f.id===replaceDeviceFrameId),layer=frame?.layers.find(l=>l.id===replaceDeviceId&&l.type==='device');
    if(!layer||layer.locked)throw new Error('Выбери незаблокированный телефон.');
    const src=await readScreenshot(file);edit(()=>{layer.image=src.image;layer.sourceName=src.sourceName;});afterEdit();notify('Этому телефону назначен отдельный экран.');
  });replaceDeviceId=replaceDeviceFrameId=null;
}
async function pngBlob(frame,format=project.format,draw=createFrameRenderer(project,images),scale=project.exportScale){const c=document.createElement('canvas');const result=draw(c,frame,format,scale);if(result.errors.length){c.width=c.height=1;throw new Error('Экспорт остановлен: не удалось отрисовать 3D-телефон. Перезапусти 3D и попробуй ещё раз.');}const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));c.width=c.height=1;if(!blob)throw new Error('Не удалось создать PNG. Попробуй масштаб 1×.');return {blob,warnings:result.warnings??[]};}
async function exportPhone(){
  const l=selected();if(!isPhone3D(l))return;
  await task('Готовим мокап без фона…',async()=>{
    const canvas=document.createElement('canvas'),img=images.get(sourceFor(l)),[w]=FORMATS[project.format];
    drawPhoneOnly(canvas,l,img,w*l.width/100,project.exportScale);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
    if(!blob)throw new Error('Не удалось создать PNG мокапа.');
    download(blob,`${exportName()}-iphone17-${project.exportScale}x.png`);notify('Мокап без фона подготовлен к скачиванию.');
  });
}
function exportAll(onlyPair=false){exportDialog.open({scope:onlyPair?'pair':'set'});}
async function prepareDownload(plan,options,progress){
  const files=[];let content=null,draw=null,warnings=0,singleBlob=null;
  try{
    for(const [i,item] of plan.entries()){
      progress(`Готовим PNG ${i+1} из ${plan.length} · ${localeLabel(item.code)} · ${item.width} × ${item.height}`);
      if(content!==item.project){collectImages();await loadProjectImages(item.project);content=item.project;draw=createFrameRenderer(content,images);}
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const result=await pngBlob(item.frame,item.format,draw,item.scale);warnings+=result.warnings.length;
      if(options.scope==='frame'&&plan.length===1)singleBlob=result.blob;
      else files.push({name:item.name,data:new Uint8Array(await result.blob.arrayBuffer())});
    }
    const prefix=options.scope==='languages'?`${safeName(project.name)}-${safeName(versionLabel(project))}-languages`:exportName();
    return {blob:singleBlob??makeZip(files),name:singleBlob?`${prefix}-${plan[0].name}`:`${prefix}-${options.scope==='pair'?'panorama-':''}${options.format}.zip`,warnings};
  }finally{collectImages();}
}
function saveProject(){
  const payload=JSON.stringify(project);if(payload.length>210*1024*1024)return notify('Проект больше 210 МБ. Скачай версии или языки отдельно либо уменьши изображения.');
  download(new Blob([payload],{type:'application/json'}),`${safeName(project.name)}.kadr.json`);dirty=false;$('save-status').textContent='Проект подготовлен к скачиванию';autosave.changed();notify(project.localization?'Проект со всеми языками и версиями подготовлен к скачиванию.':project.versions?'Проект со всеми версиями подготовлен к скачиванию.':'Проект сохраняется вместе с экранами, слоями и референсами.');
}
async function openProject(file){
  if(!file)return;if(dirty&&!confirm('Открыть другой проект? Сохрани текущий, если хочешь продолжить его позже.'))return;
  await task('Открываем проект…',async()=>{
    if(file.size>210*1024*1024)throw new Error('Файл проекта должен быть не больше 210 МБ.');let data;
    try{data=JSON.parse(await file.text());}catch{throw new Error('Выбери сохранённый файл .kadr.json.');}
    const next=validateProject(data);await loadProjectImages(next);project=next;active=0;selectedId=null;panoEditing=false;dirty=false;history.clear();autosave.changed();
    $('project-name').value=project.name;$('format').value=project.format;afterEdit();renderReferences();$('save-status').textContent=data.version===1?'Проект открыт · сохранение обновит формат':'Проект открыт из файла';notify('Проект открыт. Все слои доступны для редактирования.');
  });
}

// Inspector controls edit the model; canvas rendering never reads DOM styling.
const inspector=$('inspector-content');
inspector.addEventListener('focusin',()=>history.end());
inspector.addEventListener('focusout',()=>history.end());
inspector.addEventListener('input',e=>{
  const input=e.target,key=input.dataset.prop,l=selected();
  if(key&&l&&!l.locked){
    let value=input.type==='checkbox'?input.checked:['range','number'].includes(input.type)||['fontWeight','sourceSide'].includes(key)?Number(input.value):input.value;
    if(input.type==='number'){if(input.value===''||!Number.isFinite(value))return;value=clamp(value,Number(input.min),Number(input.max));}
    changeLayer(l,v=>{
      v[key]=value;
      if(key==='sourceSide'&&v.type==='device'){v.image=null;v.sourceName='';}
      if(key==='deviceModel'){
        if(value==='iphone17')enablePhone3D(v);
        else{v.yaw=clamp(v.yaw,-40,40);v.pitch=clamp(v.pitch,-30,30);rotate3D=false;}
      }
    },`${l.id}:${key}`);
    const output=inspector.querySelector(`[data-output="${key}"]`);if(output)output.textContent=Number(Number(value).toFixed(2))+(input.dataset.suffix||'');
    if(key==='name')renderLayers();
  }else if(input.id==='background'){edit(()=>working().background=input.value,'background');}
  else if(input.id==='gradient'){edit(()=>working().gradient=input.checked);}
  else if(input.id==='export-scale'){edit(()=>project.exportScale=Number(input.value),null,true);renderInspector();}
});
inspector.addEventListener('change',e=>{history.end();if([...LAYOUT_FIELDS,'deviceModel','sourceSide','resizeAnchor'].includes(e.target.dataset.prop)){renderInspector();render();}});
const actions={
  'open-export':()=>exportDialog.open({scope:pair()?'pair':'frame'}),
  'reset-layer-size':()=>{const l=selected();if(l&&!l.locked){edit(()=>clearFormatCorrections(working(),project.format,l.id));afterEdit();}},
  replace:()=>{replaceSourceId=current().id;$('replace-input').click();},'replace-left':()=>{replaceSourceId=pair()?.frameIds[0];$('replace-input').click();},'replace-right':()=>{replaceSourceId=pair()?.frameIds[1];$('replace-input').click();},'edit-panorama':enterPanorama,'restore-separate':()=>{const p=pair();if(!p)return;edit(()=>{restoreSeparateFrames(project,p.id);panoEditing=false;selectedId=null;});afterEdit();notify('Возвращено раздельное оформление. «Отменить» восстановит панораму.');},'center-seam':()=>{if(!pair())return;const l=selected()??working().layers.filter(l=>l.type==='device'&&!l.locked).map(l=>displayLayer(l))[0];if(!l||l.locked)return notify('Добавь или выбери незаблокированный телефон.');panoEditing=true;changeLayer(l,v=>v.x=100-v.width/2);selectLayer(l.id);render();},deselect:showDesign,layers:()=>setTab('layers'),
  'enable-3d':enablePrimaryPhone,'add-phone':addPhone,'export-phone':exportPhone,
  'replace-device':()=>{const l=selected();if(l?.type==='device'&&!l.locked){replaceDeviceId=l.id;replaceDeviceFrameId=working().id;$('device-input').click();}},
  'use-frame-source':()=>{const l=selected();if(l?.type==='device'&&!l.locked){changeLayer(l,v=>{v.image=null;v.sourceName='';});afterEdit();}},
  'save-pose':()=>{const l=selected();if(!isPhone3D(l)||project.savedPoses.length>=12)return;const name=prompt('Название ракурса',`Ракурс ${project.savedPoses.length+1}`);if(!name?.trim())return;edit(()=>project.savedPoses.push({id:uid(),name:name.trim().slice(0,60),...poseOf(l)}));renderInspector();},
  'apply-pose':()=>{const l=selected(),pose=project.savedPoses.find(p=>p.id===$('saved-pose')?.value);if(l&&!l.locked&&pose){changeLayer(l,v=>Object.assign(v,poseOf(pose)));renderInspector();}},
  'delete-pose':()=>{const id=$('saved-pose')?.value;if(id){edit(()=>project.savedPoses=project.savedPoses.filter(p=>p.id!==id));renderInspector();}},
  'add-text':addText,'add-graphic':()=>{replaceGraphicId=null;$('graphic-input').click();},'add-crop':()=>openCrop(),
  'edit-crop':()=>openCrop(selected()),'replace-graphic':()=>{replaceGraphicId=selectedId;$('graphic-input').click();},
  lock:()=>{const l=selected();if(l){changeLayer(l,v=>v.locked=!v.locked);afterEdit();}},
  visibility:()=>{const l=selected();if(l){changeLayer(l,v=>v.visible=!v.visible);afterEdit();}},
  duplicate:duplicateLayer,delete:removeLayer,up:()=>reorderLayer(1),down:()=>reorderLayer(-1),
  'apply-style':()=>{
    const base=working();edit(()=>{for(const f of [...project.frames.filter(f=>!panoramaFor(project,f.id)),...(project.panoramas??[])]){if(f===base)continue;f.background=base.background;f.gradient=base.gradient;for(const l of f.layers){if(l.type!=='text'||l.locked)continue;const src=base.layers.find(s=>s.type==='text'&&s.role===l.role);if(src){const shown=displayLayer(src),patch=Object.fromEntries(['fontFamily','fontWeight','fontSize','lineHeight','color','highlightColor'].map(k=>[k,shown[k]])),targetScene=f.frameIds?panoramaScene(project,f):f;writeLayerPatch(l,patch,targetScene,images,project.format,'all',measure);}}}});render();notify('Цвета и шрифты применены. Тексты и композиции сохранены.');
  }
};
inspector.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;const l=selected();
  if(b.dataset.action)actions[b.dataset.action]?.();
  else if(b.dataset.composition){edit(()=>{const next=clone(resolveScene(scene(),images,project.format,measure));applyComposition(next,b.dataset.composition);applySceneChanges(next);selectedId=null;});afterEdit();notify('Композиция применена. Каждый элемент можно изменить.');}
  else if(b.dataset.palette){edit(()=>applyPalette(working(),b.dataset.palette));afterEdit();}
  else if(l&&!l.locked&&b.dataset.align){changeLayer(l,v=>v.align=b.dataset.align);renderInspector();}
  else if(l&&!l.locked&&b.dataset.phoneColor){changeLayer(l,v=>v.frameColor=b.dataset.phoneColor);renderInspector();}
  else if(l&&!l.locked&&b.dataset.pose){const pose={front:{yaw:0,pitch:0,rotation:0},left:{yaw:-24,pitch:8,rotation:-7},right:{yaw:24,pitch:-5,rotation:7},back:{yaw:180,pitch:0,rotation:0}}[b.dataset.pose];if(pose){changeLayer(l,v=>Object.assign(v,pose));renderInspector();}}
  else if(l&&!l.locked&&b.dataset.position){const g=geometry.layers.find(g=>g.id===l.id);if(!g)return;const target={left:(geometry.unitWidth??geometry.width)*.08,center:(geometry.width-g.bounds.w)/2,right:geometry.width-(geometry.unitWidth??geometry.width)*.08-g.bounds.w}[b.dataset.position];changeLayer(l,v=>v.x=clamp(v.x+(target-g.bounds.x)/(geometry.unitWidth??geometry.width)*100,-200,maxX()));renderInspector();}
});

function canvasPoint(e){const r=$('preview').getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*geometry.width,y:(e.clientY-r.top)/r.height*geometry.height};}
function clearGuides(){$('guide-x').hidden=true;$('guide-y').hidden=true;}
function beginDrag(e,kind='move'){
  if(busy||canvasViewport.isPanning()||editorMode==='express'||e.button>0)return;if(viewOnly()){enterPanorama();return;}const p=canvasPoint(e);
  if(kind==='move'){
    const hit=[...geometry.layers].reverse().find(g=>!g.locked&&pointInPolygon(p,g.points));
    if(!hit){showDesign();return;}selectLayer(hit.id);
  }
  const l=selected(),g=geometry.layers.find(g=>g.id===l?.id);if(!l||l.locked||!g)return;
  e.preventDefault();e.stopPropagation();$('preview').focus({preventScroll:true});
  const target=e.currentTarget;target.setPointerCapture(e.pointerId);
  drag={kind:kind==='move'&&rotate3D&&isPhone3D(l)?'orbit':kind,pointer:e.pointerId,target,start:p,layer:l,original:clone(l),rect:g.rect,bounds:g.bounds,recorded:false};
}
$('preview').addEventListener('pointerdown',e=>beginDrag(e));$('resize-handle').addEventListener('pointerdown',e=>beginDrag(e,'resize'));$('rotate-handle').addEventListener('pointerdown',e=>beginDrag(e,'rotate'));
function snap(value,size,targets){const candidates=[];for(const t of targets)for(const anchor of [value,value+size/2,value+size]){const d=t-anchor;if(Math.abs(d)<5)candidates.push({d,t});}return candidates.sort((a,b)=>Math.abs(a.d)-Math.abs(b.d))[0];}
window.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;const p=canvasPoint(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
  if(!drag.recorded&&Math.hypot(dx,dy)<1.5)return;
  if(!drag.recorded){history.record(project);drag.recorded=true;}
  const l=drag.layer,o=drag.original,[w,h]=FORMATS[project.format];clearGuides();
  if(drag.kind==='move'){
    let sx=dx,sy=dy;
    if(!e.altKey){const xx=snap(drag.bounds.x+dx,drag.bounds.w,(panoEditing&&pair()?[w*.08,w/2,w*.92,w,w*1.08,w*1.5,w*1.92]:[w*.08,w/2,w*.92])),yy=snap(drag.bounds.y+dy,drag.bounds.h,[h*.06,h/2,h*.94]);
      if(xx){sx+=xx.d;$('guide-x').style.left=xx.t/geometry.width*100+'%';$('guide-x').hidden=false;}
      if(yy){sy+=yy.d;$('guide-y').style.top=yy.t/h*100+'%';$('guide-y').hidden=false;}
    }
    l.x=clamp(o.x+sx/w*100,-200,maxX());l.y=clamp(o.y+sy/h*100,-200,200);
  }else if(drag.kind==='resize'){
    const factor=l.type==='text'?(drag.bounds.w+dx)/drag.bounds.w:Math.hypot(p.x-drag.bounds.x,p.y-drag.bounds.y)/Math.hypot(drag.start.x-drag.bounds.x,drag.start.y-drag.bounds.y);
    l.width=clamp(o.width*factor,2,250);
  }else if(drag.kind==='orbit'){
    l.yaw=wrapAngle(o.yaw+dx/w*260);l.pitch=wrapAngle(o.pitch+dy/h*260);
    if(e.shiftKey){l.yaw=Math.round(l.yaw/15)*15;l.pitch=Math.round(l.pitch/15)*15;}
  }else{
    const cx=drag.rect.x+drag.rect.w/2,cy=drag.rect.y+drag.rect.h/2;
    let a=o.rotation+(Math.atan2(p.y-cy,p.x-cx)-Math.atan2(drag.start.y-cy,drag.start.x-cx))*180/Math.PI;
    a=((a+540)%360)-180;l.rotation=e.shiftKey?Math.round(a/15)*15:a;
  }
  const raw=working().layers.find(v=>v.id===l.id),keys={move:['x','y'],resize:['width'],orbit:['yaw','pitch'],rotate:['rotation']}[drag.kind];
  writeLayerPatch(raw,Object.fromEntries(keys.map(k=>[k,l[k]])),scene(),images,project.format,editScope,measure);
  markDirty();scheduleRender();
});
function finishDrag(e){if(!drag||(e&&drag.pointer!==e.pointerId))return;const old=drag;drag=null;clearGuides();if(old.target.hasPointerCapture(old.pointer))old.target.releasePointerCapture(old.pointer);history.end();renderInspector();render();}
window.addEventListener('pointerup',finishDrag);window.addEventListener('pointercancel',finishDrag);
$('preview').addEventListener('dblclick',()=>{if(editorMode==='express')return;if(selected()?.type==='text')$('prop-text')?.focus();else if(selected()?.type==='crop')openCrop(selected());});

function openCrop(layer=null){
  if(layer?.locked)return;if(viewOnly())enterPanorama();if(!layer&&working().layers.length>=(pair()?48:24))return notify('Достигнут лимит слоёв.');
  cropRequest={layerId:layer?.id??null,sourceSide:layer?.sourceSide??(pair()?pair().frameIds.indexOf(current().id):0),crop:clone(layer?.crop??cropLayer().crop)};
  $('crop-source').src=sourceFor(layer??{sourceSide:cropRequest.sourceSide});renderCropValues();$('crop-dialog').showModal();
}
function renderCropValues(){
  const c=cropRequest.crop;
  $('crop-values').innerHTML=[['x','X, %'],['y','Y, %'],['w','Ширина, %'],['h','Высота, %']].map(([key,label])=>`<label>${label}<input type="number" min="${['w','h'].includes(key)?1:0}" max="100" step=".1" data-crop="${key}" value="${Number(c[key].toFixed(1))}"></label>`).join('');renderCropSelection();
}
function renderCropSelection(){if(!cropRequest)return;const c=cropRequest.crop,s=$('crop-selection');s.style.left=c.x+'%';s.style.top=c.y+'%';s.style.width=c.w+'%';s.style.height=c.h+'%';}
function normalizeCrop(c){c.x=clamp(c.x,0,99);c.y=clamp(c.y,0,99);c.w=clamp(c.w,1,100-c.x);c.h=clamp(c.h,1,100-c.y);}
$('crop-values').addEventListener('input',e=>{const k=e.target.dataset.crop;if(!k||e.target.value==='')return;cropRequest.crop[k]=Number(e.target.value);normalizeCrop(cropRequest.crop);renderCropSelection();});
$('crop-values').addEventListener('change',renderCropValues);
let cropDrag=null;
function cropPoint(e){const r=$('crop-source').getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width*100,0,100),y:clamp((e.clientY-r.top)/r.height*100,0,100)};}
$('crop-source-wrap').addEventListener('pointerdown',e=>{if(!cropRequest)return;e.preventDefault();cropDrag={point:cropPoint(e),pointer:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);});
$('crop-source-wrap').addEventListener('pointermove',e=>{if(!cropDrag||cropDrag.pointer!==e.pointerId)return;const p=cropPoint(e),a=cropDrag.point;cropRequest.crop={x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),w:Math.abs(p.x-a.x),h:Math.abs(p.y-a.y)};normalizeCrop(cropRequest.crop);renderCropValues();});
for(const event of ['pointerup','pointercancel'])$('crop-source-wrap').addEventListener(event,e=>{if(cropDrag?.pointer===e.pointerId){cropDrag=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}});
$('confirm-crop').onclick=()=>{if(!cropRequest)return;normalizeCrop(cropRequest.crop);const l=working().layers.find(l=>l.id===cropRequest.layerId);if(l){edit(()=>l.crop=clone(cropRequest.crop));afterEdit();}else{const next=cropLayer();next.crop=clone(cropRequest.crop);if(pair())next.sourceSide=cropRequest.sourceSide;addLayer(next);}$('crop-dialog').close();};
$('crop-dialog').addEventListener('close',()=>{cropRequest=null;cropDrag=null;});

function toggleReferences(show){$('references-panel').hidden=!show;$('drop-zone').classList.toggle('with-refs',show);$('toggle-refs').setAttribute('aria-expanded',String(show));}
function renderReferences(){
  $('refs-count').textContent=project.references.length;$('add-refs').disabled=project.references.length>=8;
  const list=$('references-list');list.replaceChildren();
  project.references.forEach(r=>{
    const card=document.createElement('div');card.className='reference-card';const b=document.createElement('button');b.className='ref-open';b.setAttribute('aria-label',`Увеличить ${r.name}`);const img=document.createElement('img');img.src=r.image;img.alt=r.name;b.append(img);b.onclick=()=>{$('reference-large').src=r.image;$('reference-dialog').showModal();};
    const remove=makeButton('×','Убрать референс',()=>{edit(()=>project.references=project.references.filter(ref=>ref.id!==r.id));renderReferences();});const name=document.createElement('p');name.textContent=r.name;
    const use=document.createElement('button');use.type='button';use.className='button ref-use';use.textContent='Взять оформление';use.onclick=()=>{if(!busy){history.end();referenceStudio.open(r.id);}};
    card.append(b,remove,name,use);if(r.recipe){const status=document.createElement('span');status.className='ref-saved';status.textContent='Разметка сохранена';card.append(status);}list.append(card);
  });
}
async function addReferences(files){if(!files.length)return;await task('Открываем референсы…',async()=>{const capacity=8-project.references.length;if(capacity<1)throw new Error('В проекте уже 8 референсов.');const refs=[];for(const f of Array.from(files).slice(0,capacity)){const src=await readScreenshot(f);refs.push({id:uid(),image:src.image,name:src.sourceName});}edit(()=>project.references.push(...refs));renderReferences();toggleReferences(true);notify('Референсы прикреплены к проекту.');});}

function updateResizeUI(){
  const layers=correctedLayers(working(),project.format),editable=layers.filter(l=>!l.locked);
  $('resize-status').textContent=`${project.format.replace('x',' × ')} · ${layers.length?'поправки в слоях: '+layers.length:'авто'}`;
  $('reset-size').disabled=!editable.length;
  $('reset-size').title=pair()?'Сбросить поправки этого размера для всей пары':'Сбросить поправки этого размера для текущего кадра';
  $('edit-scope').value=editScope;
  $('edit-scope').options[1].textContent=`Только ${project.format.replace('x',' × ')}`;
  $('resize-toolbar').classList.toggle('is-local',editScope==='format');
  const host=$('layout-warnings'),warnings=geometry.warnings??[];host.replaceChildren();host.hidden=!warnings.length;
  for(const warning of warnings){const b=document.createElement('button');b.type='button';b.textContent=warning.message;b.onclick=()=>selectLayer(warning.id);host.append(b);}
}
$('edit-scope').onchange=e=>{finishDrag();history.end();editScope=e.target.value;updateResizeUI();renderInspector();autosave.changed();};
$('reset-size').onclick=()=>{edit(()=>clearFormatCorrections(working(),project.format));afterEdit();notify('Авторесайз восстановлен для этого размера. Заблокированные слои сохранены.');};
function updatePanoramaUI(){
  const p=pair(),wide=Boolean(p&&panoEditing);
  $('canvas-wrap').classList.toggle('panorama-canvas',wide);
  $('panorama-seam').hidden=!wide||!$('show-seam').checked;
  $('panorama-labels').hidden=!wide;
  $('panorama-options').hidden=!p;
  $('panorama-action').textContent=p?(wide?'К отдельному кадру':'Редактировать панораму'):'Панорама';
  $('panorama-action').setAttribute('aria-pressed',String(wide));
  $('export-current').textContent='Экспорт…';
  if(p){
    const first=project.frames.findIndex(f=>f.id===p.frameIds[0]);
    $('panorama-left-label').textContent=`Кадр ${first+1}`;$('panorama-right-label').textContent=`Кадр ${first+2}`;
    $('panorama-note').textContent=wide?'Общий холст. X = 100% — стык кадров. Линия разреза не входит в PNG.':'Это часть панорамы. Открой всю пару, чтобы изменить композицию.';
    if(wide)$('active-label').textContent=`Панорама ${first+1}–${first+2}`;
  }
}
function openPanorama(){
  if(pair()){panoEditing=!panoEditing;selectedId=null;rotate3D=false;afterEdit();return;}
  const select=$('panorama-pair');select.replaceChildren();
  for(let i=0;i<project.frames.length-1;i++)if(!panoramaFor(project,project.frames[i].id)&&!panoramaFor(project,project.frames[i+1].id)){
    const o=document.createElement('option');o.value=i;o.textContent=`Кадры ${i+1} + ${i+2}`;select.append(o);
  }
  if(project.frames.length<6){const o=document.createElement('option');o.value='copy';o.textContent=`Кадр ${active+1} + новая копия`;select.append(o);}
  if(!select.options.length)return notify('Нет свободной пары. Выбери два соседних кадра вне других панорам.');
  if([...select.options].some(o=>o.value===String(active)))select.value=active;
  $('panorama-dialog').showModal();
}
$('panorama-action').onclick=openPanorama;
$('show-seam').onchange=updatePanoramaUI;
$('create-panorama').onclick=()=>{
  try{
    const choice=$('panorama-pair').value;
    edit(()=>{let index=Number(choice);if(choice==='copy'){duplicateFrameUnit(project,active);index=active;}joinFrames(project,index);active=index;panoEditing=true;selectedId=null;rotate3D=false;});
    $('panorama-dialog').close();afterEdit();notify('Пара объединена. Перемещай объекты через центральную линию.');
  }catch(error){notify(error.message);}
};
$('project-name').oninput=e=>edit(()=>project.name=e.target.value,'project-name',true);$('project-name').onblur=()=>history.end();
$('format').onchange=e=>{finishDrag();edit(()=>project.format=e.target.value,null,true);afterEdit();};
$('show-design').onclick=showDesign;$('select-background').onclick=showDesign;
$('open-templates').onclick=()=>{if(project.panoramas?.length)return notify('Шаблоны для связанных панорам пока не поддерживаются. Раздельное оформление можно вернуть в свойствах панорамы.');if(!busy&&current()){history.end();templates.open();}};
$('open-texts').onclick=()=>{if(!busy&&current()){finishDrag();history.end();textEditor.open();}};
$('open-versions').onclick=()=>{if(!busy&&current()){finishDrag();history.end();versionsDialog.open();}};
$('open-batch').onclick=()=>{if(!busy&&current()){finishDrag();history.end();screenBatch.open();}};
$('open-localization').onclick=()=>{if(!busy&&current()){finishDrag();history.end();localizationDialog.open();}};
$('express-localization').onclick=()=>$('open-localization').click();
$('mode-express').onclick=()=>setMode('express');$('mode-pro').onclick=() =>setMode('pro');$('express-to-pro').onclick=()=>setMode('pro');
$('express-add').onclick=()=>$('add-screens').click();$('express-replace').onclick=()=>$('open-batch').click();
$('express-reference').onclick=()=>toggleReferences(true);
$('express-style').onclick=()=>$('open-templates').click();$('express-texts').onclick=()=>$('open-texts').click();
$('express-export').onclick=()=>exportAll();
document.querySelectorAll('[data-express-step]').forEach(b=>b.onclick=()=>{expressStep=Number(b.dataset.expressStep);renderMode();});
$('express-back').onclick=()=>{expressStep=Math.max(1,expressStep-1);renderMode();};
$('express-next').onclick=()=>{if(expressStep===4)$('export-current').click();else{expressStep++;renderMode();}};
$('add-phone').onclick=addPhone;$('enable-phone').onclick=enablePrimaryPhone;
$('rotate-3d').onclick=()=>{rotate3D=!rotate3D;updateSelection();};
$('retry-3d').onclick=()=>{resetPhoneRenderer();render();renderThumbs();};
$('configure-failed-phone').onclick=()=>{const id=geometry.errors[0]?.id;if(!id)return;setMode('pro');selectLayer(id);};
document.addEventListener('kadr-3d-restored',()=>scheduleRender());
$('undo').onclick=undo;$('redo').onclick=redo;$('add-text').onclick=addText;$('add-graphic').onclick=actions['add-graphic'];$('add-crop').onclick=()=>openCrop();
$('add-screens').onclick=()=>$('screens-input').click();$('open-project').onclick=()=>$('project-input').click();
$('save-project').onclick=saveProject;$('export-current').onclick=()=>exportDialog.open({scope:'set'});$('export-all').onclick=()=>exportAll();
$('autosave-status').onclick=()=>{renderAutosaveState(autosave.getState());$('autosave-dialog').showModal();};
$('autosave-close').onclick=()=>$('autosave-dialog').close();$('autosave-download').onclick=saveProject;
$('autosave-retry').onclick=()=>autosave.retry();$('autosave-use-current').onclick=()=>autosave.useCurrent();
$('autosave-now').onclick=()=>{autosave.changed();autosave.flush();};
$('export-both').onchange=e=>edit(()=>project.exportBothFormats=e.target.checked,null,true);
$('toggle-refs').onclick=()=>toggleReferences($('references-panel').hidden);$('close-refs').onclick=()=>toggleReferences(false);$('add-refs').onclick=()=>$('references-input').click();
for(const [id,handler] of [['screens-input',files=>addScreens(files)],['replace-input',files=>addScreens(files,true)],['device-input',files=>replaceDeviceImage(files[0])],['graphic-input',files=>addGraphic(files[0])],['references-input',addReferences],['project-input',files=>openProject(files[0])]])$(id).onchange=async e=>{await handler(e.target.files);e.target.value='';};
const zone=$('drop-zone');
zone.addEventListener('dragenter',e=>{if(!Array.from(e.dataTransfer.types).includes('Files'))return;e.preventDefault();dragDepth++;zone.classList.add('drag-over');});
zone.addEventListener('dragover',e=>{if(!Array.from(e.dataTransfer.types).includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});
zone.addEventListener('dragleave',e=>{e.preventDefault();if(--dragDepth<=0){dragDepth=0;zone.classList.remove('drag-over');}});
zone.addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;zone.classList.remove('drag-over');if(busy)return;if(editorMode==='express'||e.dataTransfer.files.length>1){finishDrag();history.end();screenBatch.open(e.dataTransfer.files);return;}replaceSourceId=current().id;await addScreens(e.dataTransfer.files,true);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosave.flush();});
window.addEventListener('pagehide',()=>autosave.flush());
window.addEventListener('beforeunload',e=>{if(dirty&&autosave.hasUnsaved()){autosave.flush();e.preventDefault();e.returnValue='';}});
window.addEventListener('keydown',e=>{
  if(busy||canvasViewport.isPanning()||document.querySelector('dialog[open]'))return;
  const input=e.target.closest('input,textarea,select,[contenteditable=true]'),mod=e.metaKey||e.ctrlKey,key=e.key.toLowerCase();
  if(mod&&key==='s'){e.preventDefault();saveProject();return;}
  if(mod&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&key==='y'){e.preventDefault();redo();return;}
  if(input)return;
  if(editorMode==='express')return;
  if(mod&&key==='d'){e.preventDefault();duplicateLayer();return;}
  if(key==='escape'){showDesign();return;}
  if(key==='delete'||key==='backspace'){if(selected()){e.preventDefault();removeLayer();}return;}
  const l=selected();if(!l||l.locked)return;
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(delta){e.preventDefault();const [w,h]=FORMATS[project.format],step=e.shiftKey?10:1;changeLayer(l,v=>{if(rotate3D&&isPhone3D(v)){v.yaw=wrapAngle(v.yaw+delta[0]*step);v.pitch=wrapAngle(v.pitch+delta[1]*step);}else{v.x=clamp(v.x+delta[0]*step/w*100,-200,maxX());v.y=clamp(v.y+delta[1]*step/h*100,-200,200);}},'nudge:'+l.id);renderInspector();}
});
window.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow'))history.end();});
busy=true;$('busy').hidden=false;$('busy-label').textContent='Открываем последний проект…';
try{
  const recovered=await autosave.start();
  if(!recovered){const demo=createDemoImage();await loadImage(demo);const f=defaultFrame(demo);enablePhone3D(f.layers[0]);Object.assign(f.layers[0],{name:'iPhone 17',yaw:-18,pitch:8,rotation:-6,width:69,y:30});project.frames=[f];}
  $('project-name').value=project.name;$('format').value=project.format;$('edit-scope').value=editScope;if(selectedId)setTab('layers');
  afterEdit();renderReferences();updateHistoryButtons();collectImages();
  if(recovered)notify('Последний проект восстановлен из этого браузера.');
}catch(e){notify(e.message||'Не удалось открыть студию. Обнови страницу.');}finally{busy=false;$('busy').hidden=true;}
