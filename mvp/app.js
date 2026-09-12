import {VERSION,STORES,PALETTES,createProject,createSlide,validateProject,moveSlide,exportIssues,slug} from './model.js';
import {ANDROID_DEVICES} from './devices.js';
import {renderSlide,frameLayout} from './render.js';
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
let project=createProject(),step=1,images=new Map(),demo,history=[],busy=false,replaceId=null,dragId=null,noticeTimer,paintTicket=0,readyDownload=null,settingsCollapsed=true;
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
function preview(){const actual=project.slides.length>0;return `<aside class="preview-well"><div class="preview-meta"><span>${actual?'Ваши экраны':'Пример оформления'}</span><span>${STORES[project.store].width} × ${STORES[project.store].height}</span></div><div class="preview-row"><canvas data-preview="0" aria-label="Предпросмотр первого слайда"></canvas><canvas data-preview="1" aria-label="Предпросмотр второго слайда"></canvas></div><p class="preview-caption">${actual?'Оформление применяется ко всему комплекту.':'Загрузите свои экраны — они появятся здесь.'}</p></aside>`;}
function framesControl(){return `<div class="segmented" aria-label="Вид рамки">${[['device',STORES[project.store].phone],['outline','Обводка'],['none','Без рамки']].map(([id,name])=>`<button data-frame="${id}" aria-pressed="${project.frame===id}">${name}</button>`).join('')}</div>`;}
function deviceControl(){
  if(project.store==='apple'||project.frame!=='device')return '';
  const selected=project.androidDevice||'android-generic';
  return `<label class="field-label" for="device-select">Устройство Android</label><select id="device-select" data-device-select>${Object.entries(ANDROID_DEVICES).filter(([id,d])=>!d.legacy||id===selected).map(([id,d])=>`<option value="${id}" ${id===selected?'selected':''}>${d.name}</option>`).join('')}</select>`;
}
function layoutControl(){return `<div class="layout-options">${[['full','Телефон целиком'],['crop','Крупный план']].map(([id,name])=>`<button class="layout-option" data-layout="${id}" aria-pressed="${project.layout===id}"><canvas data-layout-preview="${id}" aria-hidden="true"></canvas>${name}</button>`).join('')}</div>`;}
function subtitleControl(){return `<label class="switch-label">Добавить подзаголовки<input type="checkbox" data-subtitle-toggle ${project.subtitleEnabled?'checked':''}></label>`;}
function backgroundControl(){return `<div class="palettes">${PALETTES.map((p,i)=>`<button class="palette ${p.colors.every((c,j)=>c===project.background.colors[j])?'selected':''}" data-palette="${i}" aria-label="Фон ${p.name}"><span class="swatch" style="background:linear-gradient(115deg,${p.colors.join(',')})"></span>${p.name}</button>`).join('')}</div><div class="colors"><label class="color-label"><input type="color" data-color="0" value="${project.background.colors[0]}">Цвет 1</label><label class="color-label" ${project.background.mode==='solid'?'hidden':''}><input type="color" data-color="1" value="${project.background.colors[1]}">Цвет 2</label></div><label class="switch-label">Плавный переход цветов<input type="checkbox" data-gradient ${project.background.mode==='gradient'?'checked':''}></label><button class="button" data-auto-color ${project.slides.length?'':'disabled'}>Подобрать из экрана</button>`;}
function uploadControl(){return `<button class="dropzone" data-upload><span class="upload-icon">${icon('upload')}</span><strong>${project.slides.length?'Добавить ещё экраны':'Перетащите экраны или выберите файлы'}</strong><span>PNG, JPG, WebP · до ${STORES[project.store].max} экранов · до 20 МБ каждый</span></button>${project.slides.length?`<div class="upload-list">${project.slides.map((s,i)=>`<div class="upload-thumb"><img src="${s.image}" alt="Экран ${i+1}"><button data-remove="${s.id}" aria-label="Удалить экран ${i+1}">×</button></div>`).join('')}</div><p class="help">Загружено: ${project.slides.length}. Порядок можно изменить в редакторе.</p>`:''}`;}
function wizard(){
  let content='';
  if(step===1)content=`<p class="eyebrow">1. Куда загружаем</p><h1>Скриншоты для<br>вашего приложения</h1><p class="lead">Выберите магазин. Размер изображений и телефон подставятся сами.</p><div class="options">${Object.entries(STORES).map(([id,s])=>`<button class="option" data-store="${id}" aria-pressed="${project.store===id}"><span class="store-mark ${id}">${id==='rustore'?'R':id==='google'?'▶':'A'}</span><span><span class="title">${s.name}</span><span class="description">${s.width} × ${s.height} · ${s.phone}</span></span><span class="choice-check">✓</span></button>`).join('')}</div>`;
  if(step===2)content=`<p class="eyebrow">2. Исходные экраны</p><h1>Добавьте скриншоты</h1><p class="lead">Загрузите сразу весь комплект. Нужны вертикальные экраны приложения без внешней рамки телефона.</p>${uploadControl()}`;
  if(step===3)content=`<p class="eyebrow">3. Общая композиция</p><h1>Как покажем приложение?</h1><p class="lead">Две готовые композиции. Размер и положение телефона уже настроены.</p><span class="field-label">Рамка</span>${framesControl()}${deviceControl()}<span class="field-label">Расположение</span>${layoutControl()}${subtitleControl()}`;
  if(step===4)content=`<p class="eyebrow">4. Цвет комплекта</p><h1>Выберите фон</h1><p class="lead">Один стиль для всех слайдов. Цвет текста подстроится автоматически.</p>${backgroundControl()}<p class="help">Фон можно изменить в любой момент.</p>`;
  return `<ol class="stepper" aria-label="Этапы создания">${labels.map((name,i)=>`<li class="${i+1===step?'active':i+1<step?'done':''}" ${i+1===step?'aria-current="step"':''}><span class="step-num">${i+1<step?'✓':i+1}</span>${name}</li>`).join('')}</ol><div class="setup"><section class="setup-content">${content}<div class="wizard-actions"><button class="button quiet" data-back ${step===1?'style="visibility:hidden"':''}>Назад</button><button class="button primary" data-next ${step===2&&!project.slides.length?'disabled':''}>${step===4?'Открыть редактор':'Далее'}${icon('arrow')}</button></div></section>${preview()}</div><div class="footnote">Ваши изображения остаются в браузере. Регистрация не нужна.</div>`;
}
function slideCard(s,i){return `<article class="slide-card" data-slide="${s.id}"><div class="slide-head"><span class="slide-number" draggable="true" data-drag="${s.id}" title="Перетащить слайд">${icon('grip')} ${String(i+1).padStart(2,'0')}</span><div class="slide-actions"><button data-move="${s.id}" data-direction="-1" aria-label="Слайд ${i+1} влево" ${i===0?'disabled':''}>${icon('left')}</button><button data-move="${s.id}" data-direction="1" aria-label="Слайд ${i+1} вправо" ${i===project.slides.length-1?'disabled':''}>${icon('right')}</button><button data-remove="${s.id}" aria-label="Удалить слайд ${i+1}">${icon('trash')}</button></div></div><canvas class="slide-canvas" data-slide-canvas="${s.id}" tabindex="0" role="button" aria-label="Изменить заголовок слайда ${i+1}" draggable="true" data-drag="${s.id}"></canvas><button class="replace-screen" data-replace="${s.id}">Заменить экран</button><div class="slide-text"><label for="title-${s.id}">Заголовок <span data-count="${s.id}-title">${s.title.length}/90</span></label><textarea id="title-${s.id}" data-text="title" data-id="${s.id}" maxlength="90" placeholder="Например: Все расходы под контролем" rows="2">${esc(s.title)}</textarea><div ${project.subtitleEnabled?'':'hidden'}><label for="subtitle-${s.id}">Подзаголовок <span data-count="${s.id}-subtitle">${s.subtitle.length}/160</span></label><textarea id="subtitle-${s.id}" data-text="subtitle" data-id="${s.id}" maxlength="160" placeholder="Коротко объясните пользу" rows="2">${esc(s.subtitle)}</textarea></div></div></article>`;}
function editor(){const s=STORES[project.store];return `<div class="editor"><div class="editor-heading"><div><input class="project-name" data-name aria-label="Название комплекта" maxlength="80" value="${esc(project.name)}"><p class="editor-subtitle">${s.name} · ${s.width} × ${s.height} · ${screenCount(project.slides.length)}</p></div><div class="export-actions"><button class="button" data-undo ${history.length?'':'disabled'} title="Отменить последнее изменение">${icon('undo')}Отменить</button><button class="button primary" data-export ${busy?'disabled':''}>${icon('download')}${busy?'Готовим PNG…':'Скачать комплект'}</button></div></div>${readyDownload?`<div class="download-ready"><p><strong>Комплект готов.</strong><br>${project.slides.length} PNG, ${s.width} × ${s.height}. Если загрузка не началась, нажмите кнопку.</p><button class="button accent" data-download>${icon('download')}Скачать ZIP</button></div>`:''}<div class="editor-grid"><aside class="settings ${settingsCollapsed?'collapsed':''}"><h2 class="settings-title">Оформление комплекта</h2><button class="settings-toggle mobile-only" data-toggle-settings>Оформление комплекта ${settingsCollapsed?'+':'−'}</button><div class="settings-content"><div class="wide"><label class="field-label" for="store-select">Магазин</label><select id="store-select" data-store-select>${Object.entries(STORES).map(([id,v])=>`<option value="${id}" ${id===project.store?'selected':''}>${v.name} · ${v.width} × ${v.height}</option>`).join('')}</select></div><div class="wide"><span class="field-label">Рамка телефона</span>${framesControl()}${deviceControl()}</div><div><span class="field-label">Расположение</span>${layoutControl()}</div><div>${subtitleControl()}</div><div class="wide"><div class="divider"></div><span class="field-label">Общий фон</span>${backgroundControl()}</div></div></aside><section class="stage"><div class="stage-top"><p>Весь комплект перед вами</p><button class="button small" data-upload ${project.slides.length>=s.max?'disabled':''}>${icon('plus')}Добавить экраны</button></div><div id="issues" class="issue" hidden></div>${project.slides.length?`<div class="filmstrip">${project.slides.map(slideCard).join('')}<button class="add-slide" data-upload ${project.slides.length>=s.max?'disabled':''}>${icon('plus')}Добавить</button></div>`:`<div class="editor-empty"><h2>Добавьте первый экран</h2><p class="muted">Оформление уже настроено.</p><button class="button primary" data-upload>${icon('upload')}Выбрать скриншоты</button></div>`}<div class="caption-help"><p><strong>Одна польза — один заголовок.</strong> Вместо «Статистика» — «Следите за прогрессом». Подзаголовок добавляет конкретику. Тексты можно оставить пустыми.</p><p>Перетащите экран или используйте стрелки, чтобы изменить порядок.</p></div></section></div></div>`;}
function render(){const left=root.querySelector('.filmstrip')?.scrollLeft||0;root.innerHTML=step<5?wizard():editor();root.setAttribute('aria-busy',String(busy));root.inert=busy;document.getElementById('save-project').hidden=!project.slides.length;document.getElementById('new-project').hidden=!project.slides.length;for(const button of document.querySelectorAll('.header-actions button'))button.disabled=busy;const strip=root.querySelector('.filmstrip');if(strip)strip.scrollLeft=left;schedulePaint();updateIssues();}
function updateIssues(){const el=document.getElementById('issues');if(!el)return;const issues=exportIssues(project),ctx=document.createElement('canvas').getContext('2d');project.slides.forEach((s,i)=>{if(frameLayout(ctx,project,s).overflow)issues.push(`Слайд ${i+1}: сократите текст, чтобы он читался и помещался.`);});el.hidden=!issues.length;el.textContent=issues.join(' ');const button=root.querySelector('[data-export]');if(button)button.disabled=busy||issues.length>0;}
function schedulePaint(){const ticket=++paintTicket;requestAnimationFrame(()=>{if(ticket!==paintTicket)return;
  for(const canvas of root.querySelectorAll('[data-preview]')){const i=+canvas.dataset.preview,s=project.slides[i]||project.slides[0]||sampleSlide(i),p=project.slides.length?project:{...project,slides:[sampleSlide(0),sampleSlide(1)]};renderSlide(canvas,p,s,images.get(s.image)||demo,Math.min(i,Math.max(0,p.slides.length-1)),{scale:.3});}
  for(const canvas of root.querySelectorAll('[data-layout-preview]')){const s=project.slides[0]||sampleSlide(),p={...project,layout:canvas.dataset.layoutPreview,slides:[s]};renderSlide(canvas,p,s,images.get(s.image)||demo,0,{scale:.13});}
  for(const canvas of root.querySelectorAll('[data-slide-canvas]')){const i=project.slides.findIndex(s=>s.id===canvas.dataset.slideCanvas),s=project.slides[i];if(s)renderSlide(canvas,project,s,images.get(s.image),i,{scale:.38});}
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
    else for(const m of uploaded)next.slides.push(createSlide(m.source,m.name,m.width,m.height));
    validateProject(next);for(const m of uploaded)images.set(m.source,m.image);
    changed(()=>project=next);notice(target?'Экран заменён. Тексты и оформление сохранены.':`Добавлено экранов: ${uploaded.length}.`);
  }catch(error){notice(error.message,true);}finally{busy=false;screensInput.value='';render();}
}
function chooseScreens(id=null){if(busy)return;replaceId=id;screensInput.multiple=!id;screensInput.click();}
async function exportPack(){
  if(busy||exportIssues(project).length)return;
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
  const el=event.target.closest('button,[data-slide-canvas]');if(!el||busy)return;
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
  if(el.hasAttribute('data-auto-color')){const first=project.slides[0];if(!first)return;const colors=suggestColors(images.get(first.image));if(!colors)return notice('На экране нет выраженного акцентного цвета. Выберите готовый фон.');changed(()=>{project.background={mode:'gradient',colors};});return notice('Фон подобран из цвета первого экрана.');}
  if(el.hasAttribute('data-undo')){const previous=history.pop();if(previous)changed(()=>project=previous,{remember:false});return;}
  if(el.hasAttribute('data-export'))return exportPack();
  if(el.hasAttribute('data-download')&&readyDownload)return saveBlob(readyDownload.blob,readyDownload.name);
  if(el.hasAttribute('data-toggle-settings')){settingsCollapsed=!settingsCollapsed;render();return;}
  if(el.hasAttribute('data-slide-canvas'))document.getElementById('title-'+el.dataset.slideCanvas)?.focus();
});
root.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.hasAttribute('data-slide-canvas')){event.preventDefault();event.target.click();}});
root.addEventListener('focusin',event=>{if(event.target.matches('[data-text],[data-name],[data-color]'))checkpoint();});
root.addEventListener('input',event=>{
  if(busy)return;const el=event.target;
  if(el.hasAttribute('data-text')){const s=project.slides.find(s=>s.id===el.dataset.id);if(!s)return;changed(()=>s[el.dataset.text]=el.value,{remember:false,rebuild:false});const count=root.querySelector(`[data-count="${s.id}-${el.dataset.text}"]`);if(count)count.textContent=`${el.value.length}/${el.dataset.text==='title'?90:160}`;}
  if(el.hasAttribute('data-name'))changed(()=>project.name=el.value,{remember:false,rebuild:false});
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
document.getElementById('new-project').addEventListener('click',async()=>{if(busy)return;if(!await dialog('Начать новый комплект?','Текущий комплект останется в скачанном файле, если вы его сохранили. Новый комплект заменит локальное автосохранение.',{confirm:'Начать заново'}))return;changed(()=>{project=createProject();step=1;});notice('Можно создавать новый комплект.');});
window.addEventListener('beforeunload',event=>{if(autosave.hasUnsaved()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosave.flush();});
try{demo=await loadImage(createDemoImage());await autosave.start();render();}catch(error){root.textContent='Не удалось открыть редактор. Обновите страницу.';notice(error.message,true);}
