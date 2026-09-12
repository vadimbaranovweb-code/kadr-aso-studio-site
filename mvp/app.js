import {VERSION,STORES,PALETTES,createProject,createSlide,validateProject,moveSlide,exportIssues,hasExamples,storeHint,slug} from './model.js';
import {ANDROID_DEVICES,deviceFor} from './devices.js';
import {mountColorPicker} from './color-picker.js';
import {renderSlide,frameLayout,textColor} from './render.js';
import {loadImage,readScreenshot,suggestColors,saveBlob,pngBlob} from './media.js';
import {createRecoveryStore} from '../recovery-store.js';
import {createAutosave} from '../autosave.js';
import {createDemoImage} from '../demo.js';
import {makeZip} from '../zip.js';

const root=document.getElementById('app'),screensInput=document.getElementById('screens-input'),projectInput=document.getElementById('project-input');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',arrow:'M5 12h14m-6-6 6 6-6 6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',plus:'M12 5v14M5 12h14',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',grip:'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',undo:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',check:'m5 12 4 4L19 6'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.plus}"/></svg>`;
const labels=['Магазин','Экраны','Композиция','Фон','Ваш комплект'];
const screenCount=n=>`${n} ${n===1?'экран':n>=2&&n<=4?'экрана':'экранов'}`;
const clone=p=>({...p,background:{...p.background,colors:[...p.background.colors]},slides:p.slides.map(s=>({...s}))});
let project=createProject(),step=1,images=new Map(),demo,history=[],busy=false,replaceId=null,dragId=null,noticeTimer,paintTicket=0,readyDownload=null,settingsCollapsed=true,activeText=null,focusText=false,panState=null,suppressClickUntil=0,samplingColor=null;
const store=createRecoveryStore({name:'kadr-mvp-recovery:'+new URL('../',import.meta.url).pathname});
const autosave=createAutosave({store,validate:validateProject,getSnapshot:()=>({project,view:{step}}),restore:async snapshot=>{
  const restored=validateProject(snapshot.project);await cacheImages(restored);project=restored;step=Math.max(1,Math.min(5,Number(snapshot.view?.step)||5));
},onState:state=>{
  const el=document.getElementById('save-status');el.classList.toggle('error',['error','conflict'].includes(state.status));
  el.textContent=state.error||({loading:'Открываем проект…',idle:'Сохраняется в этом браузере',pending:'Сохраняем…',saving:'Сохраняем…',saved:'Сохранено в этом браузере'}[state.status]||'');
}});
function notice(message,error=false){const el=document.getElementById('notice');clearTimeout(noticeTimer);el.textContent=message;el.classList.toggle('error',error);el.hidden=false;noticeTimer=setTimeout(()=>el.hidden=true,error?10000:4500);}
function dialog(title,body,{confirm='Продолжить',cancel='Отмена',extra=''}={}){
  const el=document.getElementById('message-dialog');document.getElementById('dialog-title').textContent=title;document.getElementById('dialog-body').textContent=body;document.getElementById('dialog-extra').innerHTML=extra;
  const yes=document.getElementById('dialog-confirm'),no=document.getElementById('dialog-cancel');yes.textContent=confirm;no.textContent=cancel;el.showModal();
  return new Promise(resolve=>{const finish=value=>{el.close();yes.onclick=no.onclick=el.oncancel=null;resolve(value);};yes.onclick=()=>finish(true);no.onclick=()=>finish(false);el.oncancel=e=>{e.preventDefault();finish(false);};});
}
function checkpoint(){history.push(clone(project));if(history.length>12)history.shift();}
function changed(action,{remember=true,rebuild=true}={}){if(remember)checkpoint();action();readyDownload=null;autosave.changed();if(rebuild)render();else{root.querySelector('.download-ready')?.remove();const undo=root.querySelector('[data-undo]');if(undo)undo.disabled=!history.length;schedulePaint();updateIssues();}}
async function cacheImages(p){const results=await Promise.all(p.slides.map(async s=>{const image=images.get(s.image)||await loadImage(s.image);if(image.naturalWidth!==s.width||image.naturalHeight!==s.height)throw new Error('Размеры изображения не совпадают с данными проекта.');return [s.image,image];}));for(const pair of results)images.set(...pair);}
function sampleSlide(index=0){return {id:'sample-'+index,image:demo?.src||'',width:414,height:896,title:index?'Всё важное\nпод рукой':'Меньше дел.\nБольше жизни.',subtitle:index?'Привычки и планы в одном месте':'Освободите время для себя'};}
function preview(){return `<aside class="preview-well"><div class="preview-meta"><span>${screenCount(project.slides.length)} · предпросмотр</span><span>${STORES[project.store].width} × ${STORES[project.store].height}</span></div><div class="preview-row pan-area" tabindex="0" aria-label="Предпросмотр всех слайдов, прокрутка по горизонтали">${project.slides.map((_,i)=>`<canvas data-preview="${i}" aria-label="Предпросмотр слайда ${i+1}"></canvas>`).join('')}</div><p class="preview-caption">Потяните холст влево или вправо, чтобы посмотреть весь комплект.</p></aside>`;}

function framesControl(){return `<div class="segmented" aria-label="Вид рамки">${[['device',STORES[project.store].phone],['outline','Обводка'],['none','Без рамки']].map(([id,name])=>`<button data-frame="${id}" aria-pressed="${project.frame===id}">${name}</button>`).join('')}</div>`;}
function deviceControl(){
 const locked=project.frame!=='device',apple=project.store==='apple',selected=project.androidDevice||'android-generic';
 return `<div class="device-settings"><label class="field-label" for="device-select">Устройство</label><select id="device-select" data-device-select ${locked||apple?'disabled':''}>${apple?'<option>iPhone</option>':Object.entries(ANDROID_DEVICES).filter(([id,d])=>!d.legacy||id===selected).map(([id,d])=>`<option value="${id}" ${id===selected?'selected':''}>${d.name}</option>`).join('')}</select><div class="device-color-row"><span>Цвет корпуса</span><button class="color-chip" data-open-color="device" ${locked?'disabled':''} aria-label="Цвет корпуса"><i style="background:${project.deviceColor||deviceFor(project).body}"></i>${project.deviceColor||'Оригинал'}</button><button class="reset-color" data-reset-device-color ${locked?'disabled':''} aria-label="Исходный цвет корпуса">↺</button></div></div>`;
}

function layoutControl(){return `<div class="layout-options">${[['full','Телефон целиком'],['crop','Крупный план']].map(([id,name])=>`<button class="layout-option" data-layout="${id}" aria-pressed="${project.layout===id}"><canvas data-layout-preview="${id}" aria-hidden="true"></canvas>${name}</button>`).join('')}</div>`;}
function subtitleControl(){return `<label class="switch-label">Добавить подзаголовки<input type="checkbox" data-subtitle-toggle ${project.subtitleEnabled?'checked':''}></label>`;}
function cropControl(){const locked=project.layout!=='crop';return `<div class="crop-controls"><label>Масштаб телефона <output data-crop-output="cropScale">${Math.round((project.cropScale??1)*100)}%</output><input aria-label="Масштаб телефона" data-crop="cropScale" type="range" min="60" max="105" value="${Math.round((project.cropScale??1)*100)}" ${locked?'disabled':''}></label><label>Поднять телефон <output data-crop-output="cropRaise">${Math.round((project.cropRaise??0)*100)}%</output><input aria-label="Поднять телефон" data-crop="cropRaise" type="range" min="0" max="20" value="${Math.round((project.cropRaise??0)*100)}" ${locked?'disabled':''}></label></div>`;}
function platformOptions(){return Object.entries(STORES).map(([id,v])=>`<option value="${id}" ${id===project.store?'selected':''}>${id==='android'?'Android · 1080 × 1920':'App Store · 1320 × 2868'}</option>`).join('');}
function colorChip(index){return `<button class="color-chip" data-open-color="${index}" aria-label="Цвет фона ${index+1}"><i style="background:${project.background.colors[index]}"></i><span data-color-value="${index}">${project.background.colors[index].toUpperCase()}</span></button>`;}
function colorValue(target){return target==='device'?(project.deviceColor||deviceFor(project).body):project.background.colors[+target];}
function setColor(target,color){changed(()=>{if(target==='device')project.deviceColor=color;else project.background.colors[+target]=color;},{remember:false,rebuild:false});root.querySelectorAll(`[data-open-color="${target}"]`).forEach(button=>{button.querySelector('i').style.background=color;const label=button.querySelector('span');if(label)label.textContent=color.toUpperCase();});}
function openColor(target){checkpoint();mountColorPicker({dialog:document.getElementById('color-dialog'),value:colorValue(target),onChange:color=>setColor(target,color),onClose:()=>render(),onSample:()=>{samplingColor=target;root.classList.add('sampling');notice('Нажмите на нужный цвет на любом кадре. Esc — отмена.');}});}
function startInline(id,field){activeText={id,field};focusText=true;render();}
function textToolbar(){const slide=project.slides.find(v=>v.id===activeText?.id);if(!slide)return `<div class="text-toolbar"><span>Нажмите на заголовок или подзаголовок прямо на кадре, чтобы изменить текст.</span></div>`;const field=activeText.field,size=slide[field+'Size']|| (field==='title'?34:17);return `<div class="text-toolbar"><strong>Слайд ${project.slides.indexOf(slide)+1}</strong><span>${field==='title'?'Заголовок':'Подзаголовок'}</span><div class="font-control"><button data-font-step="-2" aria-label="Уменьшить шрифт">−</button><input type="number" aria-label="Размер шрифта" data-font-size min="${field==='title'?18:12}" max="${field==='title'?56:28}" value="${size}"><button data-font-step="2" aria-label="Увеличить шрифт">+</button></div><button class="button small" data-end-text>Готово</button></div>`;}
function backgroundControl(){return `<div class="segmented"><button data-bg-mode="solid" aria-pressed="${project.background.mode==='solid'}">Заливка</button><button data-bg-mode="gradient" aria-pressed="${project.background.mode==='gradient'}">Градиент</button></div><div class="color-stops">${colorChip(0)}${project.background.mode==='gradient'?colorChip(1):''}</div>${project.background.mode==='gradient'?`<label class="angle-control">Угол градиента <input aria-label="Угол градиента" data-angle type="number" min="0" max="360" value="${project.background.angle??20}">°</label>`:''}<div class="palettes">${PALETTES.map((p,i)=>`<button class="palette ${p.colors.every((c,j)=>c===project.background.colors[j])?'selected':''}" data-palette="${i}" aria-label="Фон ${p.name}"><span class="swatch" style="background:linear-gradient(115deg,${p.colors.join(',')})"></span>${p.name}</button>`).join('')}</div><button class="button auto-color" data-auto-color ${project.slides.length?'':'disabled'}>Подобрать из экрана</button>`;}

function uploadControl(){return `<button class="dropzone" data-upload><span class="upload-icon">${icon('upload')}</span><strong>${project.slides.length?'Добавить ещё экраны':'Перетащите экраны или выберите файлы'}</strong><span>PNG, JPG, WebP · до ${STORES[project.store].max} экранов · до 20 МБ каждый</span></button>${project.slides.length?`<div class="upload-list">${project.slides.map((s,i)=>`<div class="upload-thumb"><img src="${s.image}" alt="Экран ${i+1}"><button data-remove="${s.id}" aria-label="Удалить экран ${i+1}">×</button></div>`).join('')}</div><p class="help">Загружено: ${project.slides.length}. Порядок можно изменить в редакторе.</p>`:''}`;}
function wizard(){
  let content='';
  if(step===1)content=`<p class="eyebrow">01 / Формат</p><h1>Где будет ваше приложение?</h1><p class="lead">Выберите платформу — размеры уже настроены.</p><div class="options platform-options"><button class="option" data-store="android" aria-pressed="${project.store==='android'}"><span class="store-logos"><img src="./assets/brands/rustore.svg" alt="RuStore"><img src="./assets/brands/google-play.ico" alt="Google Play"></span><span><span class="title">Android</span><span class="description">RuStore и Google Play · 1080 × 1920</span></span><span class="choice-check">✓</span></button><button class="option" data-store="apple" aria-pressed="${project.store==='apple'}"><span class="store-logos"><img src="./assets/brands/app-store.png" alt="App Store"></span><span><span class="title">App Store</span><span class="description">iPhone · 1320 × 2868</span></span><span class="choice-check">✓</span></button></div>`;
  if(step===2)content=`<p class="eyebrow">2. Исходные экраны</p><h1>Добавьте скриншоты</h1><p class="lead">Загрузите сразу весь комплект. Нужны вертикальные экраны приложения без внешней рамки телефона.</p>${uploadControl()}`;
  if(step===3)content=`<p class="eyebrow">3. Общая композиция</p><h1>Как покажем приложение?</h1><p class="lead">Две готовые композиции. Размер и положение телефона уже настроены.</p><span class="field-label">Рамка</span>${framesControl()}${deviceControl()}<span class="field-label">Расположение</span>${layoutControl()}${cropControl()}${subtitleControl()}`;
  if(step===4)content=`<p class="eyebrow">4. Цвет комплекта</p><h1>Выберите фон</h1><p class="lead">Один стиль для всех слайдов. Цвет текста подстроится автоматически.</p>${backgroundControl()}<p class="help">Фон можно изменить в любой момент.</p>`;
  return `<ol class="stepper" aria-label="Этапы создания">${labels.map((name,i)=>`<li class="${i+1===step?'active':i+1<step?'done':''}" ${i+1===step?'aria-current="step"':''}><span class="step-num">${i+1<step?'✓':i+1}</span>${name}</li>`).join('')}</ol><div class="setup ${step<3?'setup-simple':''}"><section class="setup-content">${content}<div class="wizard-actions"><button class="button quiet" data-back ${step===1?'style="visibility:hidden"':''}>Назад</button><button class="button primary" data-next ${step===2&&!project.slides.length?'disabled':''}>${step===4?'Открыть редактор':'Далее'}${icon('arrow')}</button></div></section>${step>=3?preview():''}</div><div class="footnote">Ваши изображения остаются в браузере. Регистрация не нужна.</div>`;
}
function slideCard(s,i){const editing=activeText?.id===s.id?activeText.field:null;return `<article class="slide-card" data-slide="${s.id}"><div class="slide-head"><span class="slide-number" draggable="true" data-drag="${s.id}" title="Переставить слайд">${icon('grip')} ${String(i+1).padStart(2,'0')}</span><div class="slide-actions"><button data-move="${s.id}" data-direction="-1" aria-label="Слайд ${i+1} влево" ${i===0?'disabled':''}>${icon('left')}</button><button data-move="${s.id}" data-direction="1" aria-label="Слайд ${i+1} вправо" ${i===project.slides.length-1?'disabled':''}>${icon('right')}</button><button data-remove="${s.id}" aria-label="Удалить слайд ${i+1}">${icon('trash')}</button></div></div><div class="canvas-shell" style="aspect-ratio:${STORES[project.store].width}/${STORES[project.store].height}"><canvas class="slide-canvas" data-slide-canvas="${s.id}" aria-label="Слайд ${i+1}"></canvas>${['title',...(project.subtitleEnabled?['subtitle']:[])].map(field=>editing===field?`<textarea class="inline-text" data-inline-input data-text="${field}" data-id="${s.id}" aria-label="${field==='title'?'Заголовок':'Подзаголовок'} слайда ${i+1}" maxlength="${field==='title'?90:160}" spellcheck="true">${esc(s[field])}</textarea>`:`<button class="text-hit" data-inline="${field}" data-id="${s.id}" aria-label="Редактировать ${field==='title'?'заголовок':'подзаголовок'} слайда ${i+1}">${s[field]?'':`<span>${field==='title'?'Добавить заголовок':'Добавить подзаголовок'}</span>`}</button>`).join('')}</div><div class="slide-footer"><button class="replace-screen" data-replace="${s.id}">Заменить экран</button>${(s.titleExample&&s.title)||(project.subtitleEnabled&&s.subtitleExample&&s.subtitle)?'<span class="example-tag">Текст-пример</span>':''}</div></article>`;}

function editor(){const spec=STORES[project.store];return `<div class="editor"><div class="editor-heading"><div><input class="project-name" data-name aria-label="Название комплекта" maxlength="80" value="${esc(project.name)}"><p class="editor-subtitle">${project.store==='android'?'Android · RuStore / Google Play':'App Store'} · ${spec.width} × ${spec.height} · ${screenCount(project.slides.length)}</p></div><div class="export-actions"><button class="button" data-undo ${history.length?'':'disabled'}>${icon('undo')}Отменить</button><button class="button primary" data-export ${busy?'disabled':''}>${icon('download')}${busy?'Готовим PNG…':'Скачать комплект'}</button></div></div>${readyDownload?`<div class="download-ready"><p><strong>Комплект готов.</strong> ${project.slides.length} PNG · ${spec.width} × ${spec.height}</p><button class="button accent" data-download>Скачать ZIP</button></div>`:''}<div class="editor-grid"><aside class="settings ${settingsCollapsed?'collapsed':''}"><h2 class="settings-title">Оформление</h2><button class="settings-toggle mobile-only" data-toggle-settings>Оформление ${settingsCollapsed?'+':'−'}</button><div class="settings-content"><label class="field-label" for="store-select">Платформа</label><select id="store-select" aria-label="Платформа" data-store-select>${platformOptions()}</select><span class="field-label">Рамка телефона</span>${framesControl()}${deviceControl()}<span class="field-label">Композиция</span>${layoutControl()}${cropControl()}${subtitleControl()}<div class="divider"></div><span class="field-label">Фон комплекта</span>${backgroundControl()}</div></aside><section class="stage"><div class="stage-top"><span>Комплект <span class="muted">· потяните холст в сторону</span></span><button class="button small" data-upload ${project.slides.length>=spec.max?'disabled':''}>${icon('plus')}Добавить экраны</button></div>${textToolbar()}<div id="issues" class="issue" hidden></div><div class="filmstrip pan-area" tabindex="0" aria-label="Холст комплекта, прокрутка по горизонтали">${project.slides.map(slideCard).join('')}<button class="add-slide" data-upload ${project.slides.length>=spec.max?'disabled':''}>${icon('plus')}Добавить экран</button></div>${storeHint(project)?`<p class="store-hint">${storeHint(project)}</p>`:''}</section></div></div>`;}

function render(){root.style.setProperty('--card-ratio',STORES[project.store].width/STORES[project.store].height);const areas=[...root.querySelectorAll('.pan-area')].map(a=>[a.scrollLeft,a.scrollTop]);const wasEditing=document.activeElement?.hasAttribute('data-inline-input'),selection=wasEditing?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;if(activeText&&!project.slides.some(v=>v.id===activeText.id))activeText=null;root.innerHTML=step<5?wizard():editor();root.setAttribute('aria-busy',String(busy));root.inert=busy;document.body.classList.toggle('editing',step===5);document.getElementById('save-project').hidden=!project.slides.length;document.getElementById('new-project').hidden=!project.slides.length;for(const button of document.querySelectorAll('.header-actions button'))button.disabled=busy;[...root.querySelectorAll('.pan-area')].forEach((a,i)=>{a.scrollLeft=areas[i]?.[0]||0;a.scrollTop=areas[i]?.[1]||0;});schedulePaint();updateIssues();if(focusText||wasEditing){focusText=false;requestAnimationFrame(()=>{const el=root.querySelector('[data-inline-input]');el?.focus({preventScroll:true});if(selection)el?.setSelectionRange(...selection);});}}

function updateIssues(){const el=document.getElementById('issues');if(!el)return;const issues=exportIssues(project),ctx=document.createElement('canvas').getContext('2d');project.slides.forEach((s,i)=>{if(frameLayout(ctx,project,s).overflow)issues.push(`Слайд ${i+1}: сократите текст, чтобы он читался и помещался.`);});el.hidden=!issues.length;el.textContent=issues.join(' ');const button=root.querySelector('[data-export]');if(button)button.disabled=busy||issues.length>0;}
function schedulePaint(){const ticket=++paintTicket;requestAnimationFrame(()=>{if(ticket!==paintTicket)return;
 for(const canvas of root.querySelectorAll('[data-preview]')){const i=+canvas.dataset.preview,slide=project.slides[i];if(slide)renderSlide(canvas,project,slide,images.get(slide.image),i,{scale:.4});}
 for(const canvas of root.querySelectorAll('[data-layout-preview]')){const slide=project.slides[0]||sampleSlide(),p={...project,layout:canvas.dataset.layoutPreview,slides:[slide]};renderSlide(canvas,p,slide,images.get(slide.image)||demo,0,{scale:.13});}
 for(const canvas of root.querySelectorAll('[data-slide-canvas]')){const i=project.slides.findIndex(v=>v.id===canvas.dataset.slideCanvas),slide=project.slides[i];if(!slide)continue;const editing=activeText?.id===slide.id?activeText.field:null,l=renderSlide(canvas,project,slide,images.get(slide.image),i,{scale:.55,hideText:editing});const shell=canvas.parentElement,factor=shell.clientWidth/l.w;
 for(const el of shell.querySelectorAll('[data-inline],[data-inline-input]')){const field=el.dataset.inline||el.dataset.text,heading=field==='title',text=heading?l.title:l.sub,lineHeight=heading?1.15:1.35,y=heading&&!slide.title?8:heading?l.titleY:l.subtitleY,margin=heading?32:36;Object.assign(el.style,{left:(margin/l.w*100)+'%',top:(y/l.h*100)+'%',width:((l.w-2*margin)/l.w*100)+'%',height:(Math.max(text.size*lineHeight,text.lines.length*text.size*lineHeight)+6)*factor+'px',fontSize:text.size*factor+'px',fontWeight:heading?'700':'400',lineHeight:String(lineHeight),opacity:heading?'1':'.8',color:textColor(project.background.mode==='solid'?[project.background.colors[0]]:project.background.colors)});}
 }
});}

async function addFiles(files){
  if(busy)return;const list=[...files];if(!list.length)return;
  const available=replaceId?1:Math.max(0,STORES[project.store].max-project.slides.length);
  if(list.length>available){notice(replaceId?'Для замены выберите один экран.':`Можно добавить ещё ${available} экранов. Выберите меньше файлов.`,true);replaceId=null;return;}
  busy=true;const target=replaceId;replaceId=null;render();notice('Загружаем экраны…');
  try{
    const uploaded=[];for(const file of list){const media=await readScreenshot(file);uploaded.push({...media,name:file.name});}
    const next=clone(project);
    if(target){const s=next.slides.find(s=>s.id===target);if(!s)throw new Error('Слайд уже удалён.');Object.assign(s,{image:uploaded[0].source,name:uploaded[0].name,width:uploaded[0].width,height:uploaded[0].height});}
    else for(const m of uploaded)next.slides.push(createSlide(m.source,m.name,m.width,m.height,next.slides.length));
    validateProject(next);for(const m of uploaded)images.set(m.source,m.image);
    changed(()=>project=next);notice(target?'Экран заменён. Тексты и оформление сохранены.':`Добавлено экранов: ${uploaded.length}.`);
  }catch(error){notice(error.message,true);}finally{busy=false;screensInput.value='';render();}
}
function chooseScreens(id=null){if(busy)return;replaceId=id;screensInput.multiple=!id;screensInput.click();}
async function exportPack(){
  if(busy||exportIssues(project).length)return;
  if(hasExamples(project)&&!await dialog('В комплекте остались тексты-примеры','Их можно заменить прямо на кадрах. Скачать изображения с этими текстами?',{confirm:'Скачать как есть',cancel:'Изменить тексты'}))return;
  activeText=null;
  const ctx=document.createElement('canvas').getContext('2d');if(project.slides.some(s=>frameLayout(ctx,project,s).overflow)){notice('Сократите длинные заголовки перед экспортом.',true);return;}
  busy=true;readyDownload=null;render();const snapshot=clone(project),files=[];
  try{
    await cacheImages(snapshot);
    for(let i=0;i<snapshot.slides.length;i++){
      const canvas=document.createElement('canvas');renderSlide(canvas,snapshot,snapshot.slides[i],images.get(snapshot.slides[i].image),i);
      const blob=await pngBlob(canvas);files.push({name:`${String(i+1).padStart(2,'0')}-${snapshot.store}.png`,data:new Uint8Array(await blob.arrayBuffer())});canvas.width=canvas.height=1;
      const button=root.querySelector('[data-export]');if(button)button.textContent=`Готовим ${i+1} из ${snapshot.slides.length}…`;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    readyDownload={blob:makeZip(files),name:`${slug(snapshot.name)}-${snapshot.store}.zip`};saveBlob(readyDownload.blob,readyDownload.name);notice('Комплект готов. PNG собраны в один ZIP.');
  }catch(error){notice(error.message||'Не удалось подготовить комплект. Попробуйте снова.',true);}finally{busy=false;render();}
}
root.addEventListener('click',async event=>{
  const el=event.target.closest('button');if(!el||busy||(Date.now()<suppressClickUntil&&el.closest('.pan-area')))return;
  if(el.hasAttribute('data-inline'))return startInline(el.dataset.id,el.dataset.inline);
  if(el.hasAttribute('data-end-text')){activeText=null;render();return;}
  if(el.hasAttribute('data-open-color'))return openColor(el.dataset.openColor);
  if(el.hasAttribute('data-reset-device-color'))return changed(()=>project.deviceColor=null);
  if(el.hasAttribute('data-bg-mode'))return changed(()=>project.background.mode=el.dataset.bgMode);
  if(el.hasAttribute('data-font-step')&&activeText){const slide=project.slides.find(v=>v.id===activeText.id),field=activeText.field;return changed(()=>slide[field+'Size']=Math.max(field==='title'?18:12,Math.min(field==='title'?56:28,(slide[field+'Size']||34)+Number(el.dataset.fontStep))));}
  if(el.hasAttribute('data-store'))return changed(()=>project.store=el.dataset.store);
  if(el.hasAttribute('data-frame'))return changed(()=>project.frame=el.dataset.frame);
  if(el.hasAttribute('data-layout'))return changed(()=>project.layout=el.dataset.layout);
  if(el.hasAttribute('data-palette'))return changed(()=>{project.background.colors=[...PALETTES[+el.dataset.palette].colors];project.background.mode=project.background.colors[0]===project.background.colors[1]?'solid':'gradient';});
  if(el.hasAttribute('data-next')){if(step===2&&!project.slides.length)return;step=Math.min(5,step+1);autosave.changed();render();window.scrollTo({top:0});return;}
  if(el.hasAttribute('data-back')){step=Math.max(1,step-1);autosave.changed();render();return;}
  if(el.hasAttribute('data-upload'))return chooseScreens();
  if(el.hasAttribute('data-replace'))return chooseScreens(el.dataset.replace);
  if(el.hasAttribute('data-remove')){const s=project.slides.find(s=>s.id===el.dataset.remove);if(!s)return;if((s.title||s.subtitle)&&!await dialog('Удалить слайд?','Экран и его тексты будут удалены из комплекта. Действие можно отменить.',{confirm:'Удалить'}))return;return changed(()=>{project.slides=project.slides.filter(s=>s.id!==el.dataset.remove);});}
  if(el.hasAttribute('data-move'))return changed(()=>{const i=project.slides.findIndex(s=>s.id===el.dataset.move);moveSlide(project,i,i+Number(el.dataset.direction));});
  if(el.hasAttribute('data-auto-color')){const first=project.slides[0];if(!first)return;const colors=suggestColors(images.get(first.image));if(!colors)return notice('На экране нет выраженного акцентного цвета. Выберите готовый фон.');changed(()=>{project.background={mode:'gradient',angle:project.background.angle??20,colors};});return notice('Фон подобран из цвета первого экрана.');}
  if(el.hasAttribute('data-undo')){const previous=history.pop();if(previous)changed(()=>project=previous,{remember:false});return;}
  if(el.hasAttribute('data-export'))return exportPack();
  if(el.hasAttribute('data-download')&&readyDownload)return saveBlob(readyDownload.blob,readyDownload.name);
  if(el.hasAttribute('data-toggle-settings')){settingsCollapsed=!settingsCollapsed;render();return;}
  if(el.hasAttribute('data-slide-canvas'))document.getElementById('title-'+el.dataset.slideCanvas)?.focus();
});
root.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.hasAttribute('data-slide-canvas')){event.preventDefault();event.target.click();}});
root.addEventListener('focusin',event=>{if(event.target.matches('[data-text],[data-name],[data-crop],[data-angle],[data-font-size]'))checkpoint();});
root.addEventListener('input',event=>{
  if(busy)return;const el=event.target;
  if(el.hasAttribute('data-text')){const s=project.slides.find(s=>s.id===el.dataset.id);if(!s)return;changed(()=>{s[el.dataset.text]=el.value;s[el.dataset.text+'Example']=false;},{remember:false,rebuild:false});if(!((s.titleExample&&s.title)||(project.subtitleEnabled&&s.subtitleExample&&s.subtitle)))el.closest('.slide-card')?.querySelector('.example-tag')?.remove();const count=root.querySelector(`[data-count="${s.id}-${el.dataset.text}"]`);if(count)count.textContent=`${el.value.length}/${el.dataset.text==='title'?90:160}`;}
  if(el.hasAttribute('data-name'))changed(()=>project.name=el.value,{remember:false,rebuild:false});
  if(el.hasAttribute('data-crop')){changed(()=>project[el.dataset.crop]=Number(el.value)/100,{remember:false,rebuild:false});root.querySelector(`[data-crop-output="${el.dataset.crop}"]`).textContent=el.value+'%';}
  if(el.hasAttribute('data-angle')&&el.value!==''&&el.validity.valid)changed(()=>project.background.angle=Number(el.value),{remember:false,rebuild:false});
  if(el.hasAttribute('data-font-size')&&activeText&&el.value!==''&&el.validity.valid){const slide=project.slides.find(v=>v.id===activeText.id);changed(()=>slide[activeText.field+'Size']=Number(el.value),{remember:false,rebuild:false});}
  if(el.hasAttribute('data-color'))changed(()=>project.background.colors[+el.dataset.color]=el.value,{remember:false,rebuild:false});
});
root.addEventListener('change',event=>{if(busy)return;const el=event.target;if(el.hasAttribute('data-subtitle-toggle'))changed(()=>project.subtitleEnabled=el.checked);if(el.hasAttribute('data-gradient'))changed(()=>project.background.mode=el.checked?'gradient':'solid');if(el.hasAttribute('data-store-select'))changed(()=>project.store=el.value);if(el.hasAttribute('data-device-select')&&Object.hasOwn(ANDROID_DEVICES,el.value))changed(()=>project.androidDevice=el.value);});
root.addEventListener('dragstart',event=>{const el=event.target.closest('[data-drag]');if(!el||busy)return;dragId=el.dataset.drag;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragId);el.closest('.slide-card')?.classList.add('dragging');});
root.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();root.querySelector('.dropzone')?.classList.add('dragover');return;}if(dragId&&event.target.closest('.slide-card')){event.preventDefault();event.dataTransfer.dropEffect='move';root.querySelectorAll('.drag-target').forEach(e=>e.classList.remove('drag-target'));event.target.closest('.slide-card').classList.add('drag-target');}});
root.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length){replaceId=null;addFiles(event.dataTransfer.files);return;}const target=event.target.closest('.slide-card')?.dataset.slide;if(dragId&&target){const from=project.slides.findIndex(s=>s.id===dragId),to=project.slides.findIndex(s=>s.id===target);if(from!==to)changed(()=>moveSlide(project,from,to));}dragId=null;});
root.addEventListener('dragend',()=>{dragId=null;root.querySelectorAll('.dragging,.drag-target,.dragover').forEach(e=>e.classList.remove('dragging','drag-target','dragover'));});
screensInput.addEventListener('change',()=>addFiles(screensInput.files));
document.getElementById('open-project').addEventListener('click',()=>{if(!busy)projectInput.click();});
document.getElementById('save-project').addEventListener('click',()=>{try{saveBlob(new Blob([JSON.stringify(validateProject(project))],{type:'application/json'}),slug(project.name)+'.kadr.json');notice('Проект сохранён в файл вместе с изображениями.');}catch(error){notice(error.message,true);}});
projectInput.addEventListener('change',async()=>{
  const file=projectInput.files[0];projectInput.value='';if(!file||busy)return;
  try{
    if(file.size>190*1024*1024)throw new Error('Файл больше 190 МБ.');
    const next=validateProject(JSON.parse(await file.text()));await cacheImages(next);
    if(project.slides.length&&!await dialog('Открыть другой проект?','Текущий комплект будет заменён. Если он нужен, сначала сохраните его в файл.',{confirm:'Открыть'}))return;
    changed(()=>{project=next;step=5;});notice('Проект открыт.');
  }catch(error){if(error.name==='LegacyProjectError')await dialog('Проект предыдущей версии',error.message,{confirm:'Понятно',cancel:'Закрыть',extra:'<a href="./legacy.html" target="_blank" rel="noopener">Открыть предыдущий редактор</a>'});else notice(error instanceof SyntaxError?'Не удалось прочитать файл проекта.':error.message,true);}
});
document.getElementById('new-project').addEventListener('click',async()=>{if(busy)return;if(!await dialog('Начать новый комплект?','Текущий комплект останется в скачанном файле, если вы его сохранили. Новый комплект заменит локальное автосохранение.',{confirm:'Начать заново'}))return;changed(()=>{project=createProject();step=1;activeText=null;});notice('Можно создавать новый комплект.');});
window.addEventListener('beforeunload',event=>{if(autosave.hasUnsaved()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosave.flush();});

root.addEventListener('pointerdown',event=>{
 const area=event.target.closest('.pan-area');if(!area||busy)return;
 if(samplingColor!==null){const canvas=event.target.closest('.canvas-shell')?.querySelector('canvas')||event.target.closest('canvas');if(canvas){const r=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-r.left)*canvas.width/r.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-r.top)*canvas.height/r.height))),rgb=canvas.getContext('2d').getImageData(x,y,1,1).data,color='#'+[...rgb].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');setColor(samplingColor,color);samplingColor=null;root.classList.remove('sampling');suppressClickUntil=Date.now()+350;render();notice('Цвет выбран.');}event.preventDefault();return;}
 if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('input,textarea,select,[data-drag],button:not([data-inline])'))return;
 panState={area,x:event.clientX,y:event.clientY,left:area.scrollLeft,top:area.scrollTop,target:event.target.closest('[data-inline]'),moved:false,id:event.pointerId};
});
root.addEventListener('pointermove',event=>{if(!panState||event.pointerId!==panState.id)return;const dx=event.clientX-panState.x,dy=event.clientY-panState.y;if(Math.abs(dx)+Math.abs(dy)>5&&!panState.moved){panState.moved=true;panState.area.setPointerCapture(event.pointerId);panState.area.classList.add('panning');}if(panState.moved){event.preventDefault();panState.area.scrollLeft=panState.left-dx;panState.area.scrollTop=panState.top-dy;}});
function endPan(){if(panState?.moved){suppressClickUntil=Date.now()+350;panState.area.classList.remove('panning');if(panState.area.hasPointerCapture(panState.id))panState.area.releasePointerCapture(panState.id);}panState=null;}
root.addEventListener('pointerup',endPan);root.addEventListener('pointercancel',endPan);window.addEventListener('pointerup',endPan);
window.addEventListener('resize',schedulePaint);
window.addEventListener('keydown',event=>{if(event.key==='Escape'){samplingColor=null;root.classList.remove('sampling');if(activeText){activeText=null;render();}}});

try{demo=await loadImage(createDemoImage());await autosave.start();render();}catch(error){root.textContent='Не удалось открыть редактор. Обновите страницу.';notice(error.message,true);}
