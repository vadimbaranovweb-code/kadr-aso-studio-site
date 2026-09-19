import {openContentCopy} from './content-copy-dialog.js';
import {DEFAULT_POSE,is3D} from './phone-pose.js';
import {setFontSize} from './editor-settings.js';
import {STEPS,WIZARD_VERSION,restoreStep,canVisit} from './workflow.js';
import {compositionControls,setCompositionValue} from './composition-controls.js';
import {screenFor,screenSettings,screenAssets,putScreen} from './screen-assets.js';
import {freePackEntries} from './free-pack.js';
import {marksFor,setMark,editMarks} from './text-marks.js';
import {STORES,APPLE_FORMATS,formatFor,exportFormats,cloneProject,createProject,createSlide,validateProject,moveSlide,exportIssues,hasExamples,slug} from './model.js';
import {ANDROID_DEVICES,IPHONE_DEVICES,deviceFor} from './devices.js';
import {mountColorPicker} from './color-picker.js';
import {renderSlide,frameLayout,textColor,compositeColor} from './render.js';
import {loadImage,readScreenshot,saveBlob,pngBlob} from './media.js';
import {createRecoveryStore} from '../recovery-store.js';
import {createAutosave} from '../autosave-core.js';
import {makeZip} from '../zip.js';

const root=document.getElementById('app'),screensInput=document.getElementById('screens-input'),projectInput=document.getElementById('project-input');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',arrow:'M5 12h14m-6-6 6 6-6 6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',plus:'M12 5v14M5 12h14',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',grip:'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',undo:'M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12',check:'m5 12 4 4L19 6'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.plus}"/></svg>`;
const labels=STEPS;
const screenCount=n=>`${n} ${n===1?'экран':n>=2&&n<=4?'экрана':'экранов'}`;
const clone=cloneProject;
let project=createProject(),revision=0,step=1,images=new Map(),history=[],busy=false,replaceId=null,dragId=null,noticeTimer,paintTicket=0,readyDownload=null,activeText=null,focusText=false,panState=null,suppressClickUntil=0,samplingColor=null,activePhone=null,selectedSlideId=null,colorPicker=null,canvasScroll=[0,0],panelScroll={},lastRenderedStep=1;
const store=createRecoveryStore({name:'kadr-mvp-recovery:'+new URL('../',import.meta.url).pathname});
const autosave=createAutosave({store,validate:validateProject,getSnapshot:()=>({project,view:{step,wizardVersion:WIZARD_VERSION}}),restore:async snapshot=>{
  const restored=validateProject(snapshot.project);await cacheImages(restored);project=restored;const view=snapshot.view||{};step=restoreStep(view,project.slides.length>0);

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
function changed(action,{remember=true,rebuild=true}={}){if(remember)checkpoint();action();revision++;readyDownload=null;autosave.changed();if(rebuild)render();else{root.querySelector('.download-ready')?.remove();const undo=root.querySelector('[data-undo]');if(undo)undo.disabled=!history.length;schedulePaint();updateIssues();}}
async function cacheImages(p){const results=await Promise.all(screenAssets(p).map(async s=>{const image=images.get(s.image)||await loadImage(s.image);if(image.naturalWidth!==s.width||image.naturalHeight!==s.height)throw new Error('Размеры изображения не совпадают с данными проекта.');return [s.image,image];}));for(const pair of results)images.set(...pair);}
function framesControl(){return `<div class="segmented" aria-label="Вид рамки">${[['device',STORES[project.store].phone],['outline','Обводка'],['none','Без рамки']].map(([id,name])=>`<button data-frame="${id}" aria-pressed="${project.frame===id}">${name}</button>`).join('')}</div>`;}
function deviceControl(){
 const locked=project.frame!=='device',apple=project.store==='apple',selected=apple?project.iphoneDevice:project.androidDevice||'android-generic';
 return `<div class="device-settings"><label class="field-label" for="device-select">Устройство</label><select id="device-select" data-device-select ${locked?'disabled':''}>${Object.entries(apple?IPHONE_DEVICES:ANDROID_DEVICES).filter(([id,d])=>!d.legacy||id===selected).map(([id,d])=>`<option value="${id}" ${id===selected?'selected':''}>${d.name}</option>`).join('')}</select><div class="device-color-row"><span>Цвет корпуса</span><button class="color-chip" data-open-color="device" ${locked?'disabled':''} aria-label="Цвет корпуса"><i style="background:${project.deviceColor||deviceFor(project).body}"></i><span>${project.deviceColor||'Оригинал'}</span></button><button class="reset-color" data-reset-device-color ${locked?'disabled':''} aria-label="Исходный цвет корпуса">↺</button></div></div>`;
}

function subtitleControl(){return `<label class="switch-label">Добавить подзаголовки<input type="checkbox" data-subtitle-toggle ${project.subtitleEnabled?'checked':''}></label>`;}
function cropControl(){return `<label class="switch-label align-phones">Телефоны на одном уровне<input type="checkbox" data-align-phones ${project.phoneAlignment==='shared'?'checked':''}></label><div class="crop-controls"><label>Масштаб телефона <output data-phone-output="phoneScale">${Math.round((project.phoneScale??1)*100)}%</output><input aria-label="Масштаб телефона" data-phone="phoneScale" type="range" min="60" max="180" value="${Math.round((project.phoneScale??1)*100)}"></label><label>Положение по вертикали <output data-phone-output="phoneY">${Math.round(project.phoneY*100)}%</output><input aria-label="Положение телефона" data-phone="phoneY" type="range" min="-20" max="30" value="${Math.round(project.phoneY*100)}"></label></div>`;}
function formatControl(){return project.store==='apple'?`<label class="field-label">Размер предпросмотра</label><div class="segmented">${Object.entries(APPLE_FORMATS).reverse().map(([id,f])=>`<button data-format="${id}" aria-pressed="${project.appleFormat===id}">${f.width} × ${f.height}</button>`).join('')}</div><p class="help">В ZIP попадут оба размера.</p>`:'';}
function platformOptions(){return Object.entries(STORES).map(([id,v])=>`<option value="${id}" ${id===project.store?'selected':''}>${id==='android'?'Android · 1080 × 1920':'App Store · два размера'}</option>`).join('');}
function colorChip(index){return `<button class="color-chip" data-open-color="${index}" aria-label="Цвет фона ${index+1}"><i style="background:${project.background.colors[index]}"></i><span data-color-value="${index}">${project.background.colors[index].toUpperCase()}</span></button>`;}
function displayedTextColor(){return project.textColor||textColor(project.background.colors.slice(0,project.background.mode==='solid'?1:2).map((c,i)=>compositeColor(c,project.background.opacities[i])));}
function colorValue(target,id){if(target==='device')return project.deviceColor||deviceFor(project).body;if(target==='text')return displayedTextColor();return project.background.colors[+target];}
function setColor(target,color,id){changed(()=>{if(target==='device')project.deviceColor=color;else if(target==='text')project.textColor=color;else project.background.colors[+target]=color;},{remember:false,rebuild:false});root.querySelectorAll(`[data-open-color="${target}"]`).forEach(button=>{button.querySelector('i')?.style.setProperty('background',color);const label=button.querySelector('span');if(label)label.textContent=color.toUpperCase();});const textChip=root.querySelector('[data-open-color="text"] i');if(textChip){textChip.style.background=displayedTextColor();textChip.parentElement.querySelector('span').textContent=displayedTextColor().toUpperCase();}}
function openColor(target,anchor){colorPicker?.close();document.getElementById('color-title').textContent='Цвет';checkpoint();const id=selectedSlide()?.id,allowOpacity=target==='text'||['0','1'].includes(target),opacity=target==='text'?project.textOpacity:project.background.opacities[+target];colorPicker=mountColorPicker({dialog:document.getElementById('color-dialog'),anchor,value:colorValue(target,id),opacity,allowOpacity,onOpacity:value=>changed(()=>{if(target==='text')project.textOpacity=value;else project.background.opacities[+target]=value;},{remember:false,rebuild:false}),onChange:color=>setColor(target,color,id),onSample:()=>{samplingColor={target,id};root.classList.add('sampling');notice('Нажмите на нужный цвет на любом кадре. Esc — отмена.');}});}

function selectedSlide(){return project.slides.find(s=>s.id===selectedSlideId)||project.slides[0];}
// Capture native selection before the nonmodal picker takes focus. Never recover
// it by searching for a phrase: repeated words must remain independent.
let selectionPointer=false,selectionKeyboard=false,selectionTimer,textEditCheckpoint=true,dismissedSelection=null;
function openSelectionColor(input){
 if(busy||!input?.isConnected||document.activeElement!==input||!input.hasAttribute('data-inline-input'))return;
 let start=input.selectionStart,end=input.selectionEnd;
 while(start<end&&/\s/.test(input.value[start]))start++;
 while(end>start&&/\s/.test(input.value[end-1]))end--;
 if(start===end){colorPicker?.close();return;}
 const id=input.dataset.id,field=input.dataset.text,source=input.value,locale=project.locale;
 const selectionKey=`${id}:${field}:${start}:${end}`;if(colorPicker?.selectionKey===selectionKey||dismissedSelection===selectionKey)return;
 colorPicker?.close();
 const slide=project.slides.find(s=>s.id===id);if(!slide)return;
 const previous=marksFor(slide,field).find(m=>m.start<=start&&m.end>=end);
 let style=previous?.style||'text',radius=previous?.radius??6,color=previous?.color||'#2563EB',remember=true;
 const valid=()=>project.locale===locale&&project.slides.find(s=>s.id===id)?.[field]===source;
 const apply=(reset=false)=>{if(!valid())return;changed(()=>{const s=project.slides.find(s=>s.id===id);s[field+'Marks']=setMark(marksFor(s,field),start,end,reset?null:{style,color,radius});s[field+'Highlight']='';},{remember,rebuild:false});remember=false;textEditCheckpoint=true;};
 const dialog=document.getElementById('color-dialog');document.getElementById('color-title').textContent='«'+source.slice(start,end)+'»';
 colorPicker=mountColorPicker({dialog,anchor:input,value:color,keepSelection:true,decoration:{style,radius},onChange:value=>{color=value;apply();},onDecoration:value=>{style=value.style;radius=value.radius;apply();},onReset:()=>apply(true),onSample:()=>{samplingColor={apply:value=>{color=value;apply();}};root.classList.add('sampling');notice('Нажмите на нужный цвет на кадре.');},onClose:()=>{dismissedSelection=selectionKey;colorPicker=null;}});
 colorPicker.selectionKey=selectionKey;
}
root.addEventListener('pointerdown',e=>{if(e.target.hasAttribute('data-inline-input')){selectionPointer=true;dismissedSelection=null;}});
window.addEventListener('pointerup',()=>{if(!selectionPointer)return;selectionPointer=false;const input=root.querySelector('[data-inline-input]');clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>openSelectionColor(input),0);});
window.addEventListener('pointercancel',()=>selectionPointer=false);
root.addEventListener('keydown',e=>{if(e.target.hasAttribute('data-inline-input')&&e.shiftKey){selectionKeyboard=true;dismissedSelection=null;clearTimeout(selectionTimer);}});
root.addEventListener('keyup',e=>{if(e.key==='Shift')selectionKeyboard=false;if(!selectionKeyboard&&e.target.hasAttribute('data-inline-input')&&(e.key==='Shift'||e.key.startsWith('Arrow')||e.key==='a')){clearTimeout(selectionTimer);const input=e.target;selectionTimer=setTimeout(()=>openSelectionColor(input),0);}});
// Native touch selection handles can change a textarea selection without pointerup.
document.addEventListener('selectionchange',()=>{const input=document.activeElement;if(!selectionPointer&&!selectionKeyboard&&input?.hasAttribute('data-inline-input')){clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>openSelectionColor(input),250);}});
function revealControl(selector){const panel=root.querySelector('.inspector-scroll'),target=panel?.querySelector(selector);if(!panel||!target)return;const p=panel.getBoundingClientRect(),r=target.getBoundingClientRect();if(r.top<p.top||r.bottom>p.bottom)panel.scrollTop+=r.top-p.top-16;}
function startInline(id,field){dismissedSelection=null;activePhone=null;selectedSlideId=id;activeText={id,field};focusText=true;render();revealControl(`[data-size-field="${field}"]`);}
function section(title,content){return `<section class="control-section"><h3>${title}</h3>${content}</section>`;}
function fontControl(field,all=false){const slide=selectedSlide(),size=slide?.[field+'Size']??(field==='title'?34:17),mixed=all&&project.slides.some(s=>s[field+'Size']!==size),label=field==='title'?'Размер заголовка':'Размер подзаголовка';return `<div class="size-row"><span>${field==='title'?'Заголовок':'Подзаголовок'}</span><span class="font-control"><button data-size-step="-1" data-size-field="${field}" ${all?'data-all':''} aria-label="Уменьшить: ${label}">−</button><input type="number" data-size-field="${field}" ${all?'data-all':''} aria-label="${label}" min="${field==='title'?18:12}" max="${field==='title'?56:28}" value="${mixed?'':size}" placeholder="Разные"><button data-size-step="1" data-size-field="${field}" ${all?'data-all':''} aria-label="Увеличить: ${label}">+</button></span></div>`;}

function typographyControl(){return `<p class="control-hint">Текст меняется на кадре. Размер шрифта — сразу во всём комплекте.</p>`+fontControl('title',true)+(project.subtitleEnabled?fontControl('subtitle',true):'');}

function backgroundControl(){
 const fill=`<div class="segmented"><button data-bg-mode="solid" aria-pressed="${project.background.mode==='solid'}">Заливка</button><button data-bg-mode="gradient" aria-pressed="${project.background.mode==='gradient'}">Градиент</button></div><div class="color-stops">${colorChip(0)}${project.background.mode==='gradient'?colorChip(1):''}</div>${project.background.mode==='gradient'?`<label class="angle-control">Угол градиента <output data-angle-output>${project.background.angle??20}°</output><input aria-label="Угол градиента" data-angle type="range" min="0" max="360" value="${project.background.angle??20}"></label>`:''}`;
 const asset=project.background.asset?`<div class="background-thumb"><img src="${project.background.asset.image}" alt="Фон из проекта"><button class="button small" data-bg-mode="${project.background.mode==='image'?'solid':'image'}">${project.background.mode==='image'?'Выключить фон':'Использовать фон'}</button></div>`:'';
 const text=`<span class="field-label">Цвет текста</span><div class="color-stops"><button class="color-chip" data-open-color="text" aria-label="Цвет текста"><i style="background:${displayedTextColor()}"></i><span>${displayedTextColor().toUpperCase()}</span></button><button class="button quiet small" data-auto-text aria-label="Автоматический цвет текста">Авто</button></div>`;
 return fill+asset+text;
}

function poseControl(){
 const s=selectedSlide();if(!s)return '';const p={...DEFAULT_POSE,...s.phonePose},three=is3D(project,s);
 const range=(key,label,min,max,step=1)=>`<label>${label}<output data-pose-output="${key}">${p[key]??s.composition?.phone.rotation??0}</output><input data-pose="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${p[key]??s.composition?.phone.rotation??0}"></label>`;
 return `<div class="pose-controls"><strong>Мокап · слайд ${project.slides.indexOf(s)+1}</strong><div class="segmented"><button data-pose-mode="flat" aria-pressed="${!three}">2D</button><button data-pose-mode="3d" aria-pressed="${three}" ${project.frame!=='device'?'disabled':''}>3D</button></div>${range('rotation','Поворот',-180,180)}${three?range('yaw','Разворот в 3D',-180,180)+range('pitch','Наклон в 3D',-80,80)+range('perspective','Перспектива',20,60)+range('reflection','Блик',0,1,.01):''}<button class="button small" data-reset-pose>Сбросить поворот</button>${three?`<p class="control-hint">${project.store==='apple'?'Объёмная модель iPhone 17.':'Объёмный Android-мокап по пропорциям выбранного устройства, с круглой камерой.'} Цвет корпуса и исходный UI сохраняются.</p>`:''}</div>`;
}
function revealSlide(id){root.querySelector(`[data-slide="${id}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}
function selectSlide(id){if(!project.slides.some(s=>s.id===id))return;activeText=null;activePhone=null;selectedSlideId=id;render();revealSlide(id);}
function slideNavigation(){const s=selectedSlide(),i=project.slides.indexOf(s);return `<div class="slide-navigator"><button class="button icon-action" data-select-slide="${project.slides[i-1]?.id||''}" aria-label="Предыдущий слайд" ${i<=0?'disabled':''}>${icon('left')}</button><select data-slide-select aria-label="Активный слайд">${project.slides.map((slide,index)=>`<option value="${slide.id}" ${slide.id===s.id?'selected':''}>Слайд ${index+1} из ${project.slides.length}</option>`).join('')}</select><button class="button icon-action" data-select-slide="${project.slides[i+1]?.id||''}" aria-label="Следующий слайд" ${i>=project.slides.length-1?'disabled':''}>${icon('right')}</button></div><p class="control-hint">Нажмите на кадр или переключите слайд здесь.</p>`;}
root.addEventListener('change',event=>{if(!busy&&event.target.hasAttribute('data-slide-select'))selectSlide(event.target.value);});
root.addEventListener('click',event=>{if(busy||step!==3||Date.now()<suppressClickUntil||samplingColor)return;const select=event.target.closest('[data-select-slide]');if(select)return selectSlide(select.dataset.selectSlide);if(!event.target.closest('button,input,textarea,select')){const card=event.target.closest('[data-slide]');if(card)selectSlide(card.dataset.slide);}});
function orderControl(){const s=selectedSlide();return !s?'':`<p class="control-hint">Слайд ${project.slides.indexOf(s)+1}</p><div class="segmented"><button data-content-order="text-top" aria-pressed="${s.contentOrder!=='text-bottom'}">Текст сверху</button><button data-content-order="text-bottom" aria-pressed="${s.contentOrder==='text-bottom'}">Текст снизу</button></div>`;}
function phoneToolbar(){const original=project.slides.find(s=>s.id===activePhone),s=original?screenFor(original,project.locale):null;if(!s){activePhone=null;return '';}return `<div class="text-toolbar phone-toolbar"><strong>Экран внутри телефона</strong><div class="segmented"><button data-screen-fit="cover" aria-pressed="${s.screenFit==='cover'}">Заполнить</button><button data-screen-fit="contain" aria-pressed="${s.screenFit==='contain'}">Вместить</button></div>${[['screenScale','Масштаб UI',100,300],['screenX','По горизонтали',-100,100],['screenY','По вертикали',-100,100]].map(([key,label,min,max])=>`<label>${label} <output data-screen-output="${key}">${Math.round(s[key]*100)}%</output><input type="range" data-screen="${key}" aria-label="${label}" min="${min}" max="${max}" value="${Math.round(s[key]*100)}"></label>`).join('')}<button class="button small" data-reset-screen>Сбросить</button><button class="button small" data-end-text>Готово</button></div>`;}

root.addEventListener('change',e=>{if(!busy&&e.target.hasAttribute('data-export-scale'))changed(()=>project.exportScale=+e.target.value);});
function goStep(next){if(!canVisit(next,project.slides.length>0))return;activeText=null;activePhone=null;colorPicker?.close();step=next;autosave.changed();render();}
function exportControls(){return section('В комплекте',`<p class="export-summary">${screenCount(project.slides.length)}</p><p class="control-hint">Бесплатно · без водяного знака.</p>`)+section('Размеры',project.store==='apple'?`<select data-export-scale aria-label="Масштаб экспорта"><option value="3" ${project.exportScale===3?'selected':''}>3× · для App Store</option><option value="1" ${project.exportScale===1?'selected':''}>1× · рабочие размеры</option></select><p class="control-hint">${project.exportScale===3?'1320 × 2868 и 1242 × 2688':'440 × 956 и 414 × 896'} · оба размера в ZIP.</p>`:'<p class="control-hint">Android · 1080 × 1920</p>')+`<div id="issues" class="issue" hidden></div><button class="button primary" data-export>Скачать ZIP</button>${readyDownload?`<div class="download-ready"><p>${readyDownload.count} PNG готовы.</p><button class="button" data-download>Скачать ещё раз</button></div>`:''}`;}
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.hasAttribute('data-step'))goStep(Number(b.dataset.step));});
function uploadControl(){return `<button class="dropzone" data-upload><span class="upload-icon">${icon('upload')}</span><strong>${project.slides.length?'Добавить ещё экраны':'Перетащите скриншоты приложения'}</strong><span>PNG, JPG, WebP · до ${STORES[project.store].max} экранов · до 20 МБ каждый</span></button>${project.slides.length?`<div class="upload-list">${project.slides.map((s,i)=>`<div class="upload-thumb"><img src="${s.image}" alt="Экран ${i+1}"><button data-remove="${s.id}" aria-label="Удалить экран ${i+1}">×</button></div>`).join('')}</div><p class="help">Загружено: ${project.slides.length}. Порядок можно изменить в редакторе.</p>`:''}`;}
function setupContent(){
  let content='';
  if(step===1)content=`<p class="eyebrow">01 / Формат</p><h1>Где будет ваше приложение?</h1><p class="lead">Выберите платформу — размеры уже настроены.</p><div class="options platform-options"><button class="option" data-store="apple" aria-pressed="${project.store==='apple'}"><span class="store-logos"><img src="./assets/brands/app-store.png" alt="App Store"></span><span><span class="title">App Store</span><span class="description">iPhone · 440 × 956 и 414 × 896</span></span><span class="choice-check">✓</span></button><button class="option" data-store="android" aria-pressed="${project.store==='android'}"><span class="store-logos android-logos"><img src="./assets/brands/rustore.svg" alt="RuStore"><img src="./assets/brands/google-play.ico" alt="Google Play"></span><span><span class="title">Android</span><span class="description">RuStore и Google Play · 1080 × 1920</span></span><span class="choice-check">✓</span></button></div>`;
  if(step===2)content=`<p class="eyebrow">2. Исходные экраны</p><h1>Добавьте экраны своего приложения</h1><p class="lead">Сделайте снимки внутри вашего приложения: главная, полезная функция, результат. Загрузите их без мокапов и рекламных надписей — оформление добавим здесь.</p><div class="upload-guidance"><strong>Для пробы хватит одного экрана</strong><p>Для полноценного комплекта рекомендуем 3–5 разных экранов.</p>${project.store==='android'?'<p><a href="https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication" target="_blank" rel="noopener">RuStore</a>: минимум 3. <a href="https://support.google.com/googleplay/android-developer/answer/9866151?hl=ru" target="_blank" rel="noopener">Google Play</a>: минимум 2, для некоторых форматов рекомендаций — 4.</p>':''}</div>${uploadControl()}`;
  return `<div class="onboarding-content">${content}</div>`;
}
function slideCard(s,i){const editing=activeText?.id===s.id?activeText.field:null,selected=selectedSlide()?.id===s.id;return `<article class="slide-card ${selected?'active-slide':''}" data-slide="${s.id}" aria-label="Слайд ${i+1}${selected?', выбран':''}"><div class="slide-head"><span class="slide-grip" draggable="true" data-drag="${s.id}" title="Перетащить слайд">${icon('grip')}</span><button class="slide-number" data-select-slide="${s.id}" aria-pressed="${selected}">Слайд ${i+1}</button><div class="slide-actions"><button data-move="${s.id}" data-direction="-1" title="Переставить слайд влево" aria-label="Переставить слайд ${i+1} влево" ${i===0?'disabled':''}>${icon('left')}</button><button data-move="${s.id}" data-direction="1" title="Переставить слайд вправо" aria-label="Переставить слайд ${i+1} вправо" ${i===project.slides.length-1?'disabled':''}>${icon('right')}</button><button data-remove="${s.id}" aria-label="Удалить слайд ${i+1}">${icon('trash')}</button></div></div><div class="canvas-shell" style="aspect-ratio:${formatFor(project).width}/${formatFor(project).height}"><canvas class="slide-canvas" data-slide-canvas="${s.id}" aria-label="Слайд ${i+1}"></canvas><button class="phone-hit ${activePhone===s.id?'selected':''}" data-phone-hit="${s.id}" aria-label="Настроить экран внутри телефона на слайде ${i+1}"></button>${['title',...(project.subtitleEnabled?['subtitle']:[])].map(field=>editing===field?`<textarea class="inline-text" data-inline-input data-text="${field}" data-id="${s.id}" aria-label="${field==='title'?'Заголовок':'Подзаголовок'} слайда ${i+1}" maxlength="${field==='title'?90:160}" spellcheck="true">${esc(s[field])}</textarea>`:`<button class="text-hit" data-inline="${field}" data-id="${s.id}" aria-label="Редактировать ${field==='title'?'заголовок':'подзаголовок'} слайда ${i+1}">${s[field]?'':`<span>${field==='title'?'Добавить заголовок':'Добавить подзаголовок'}</span>`}</button>`).join('')}</div><div class="slide-footer"><button class="replace-screen" data-replace="${s.id}">Заменить экран</button>${(s.titleExample&&s.title)||(project.subtitleEnabled&&s.subtitleExample&&s.subtitle)?'<span class="example-tag">Текст-пример</span>':''}</div></article>`;}

function inspector(){
 if(step===1)return section('Формат',`<p class="control-hint">${project.store==='apple'?'App Store · iPhone':'Android · RuStore и Google Play'}</p>`+formatControl());
 if(step===2)return section('Экраны',`<p class="control-hint">${screenCount(project.slides.length)} из ${STORES[project.store].max}</p><p class="control-hint">PNG, JPG или WebP. Заголовки-примеры можно заменить прямо в редакторе.</p>`);
 if(step===4)return exportControls();
 return section('Активный слайд',slideNavigation())+section('Расположение',orderControl())+section('Тексты',typographyControl()+subtitleControl()+'<button class="button content-generate" data-generate-copy>Сгенерировать по содержимому</button><p class="control-hint">Необязательно · свой API-ключ</p>')+section('Телефон',framesControl()+deviceControl()+cropControl())+section('Фон и цвет текста',backgroundControl())+(activePhone?section('Выбранный телефон',poseControl()+phoneToolbar()):'')+compositionControls(project,selectedSlideId||selectedSlide()?.id)+section('Платформа',`<select aria-label="Платформа" data-store-select>${platformOptions()}</select>`+formatControl());
}
function workspace(){const spec=formatFor(project),editable=step===3;return `<div class="workspace" data-workflow-step="${step}">
 <nav class="workflow-nav" aria-label="Этапы создания"><span class="nav-caption">Создание комплекта</span><ol>${labels.map((name,i)=>`<li><button data-step="${i+1}" ${canVisit(i+1,project.slides.length>0)?'':'disabled'} ${i+1===step?'aria-current="step"':''}><span class="nav-number">${String(i+1).padStart(2,'0')}</span>${name}</button></li>`).join('')}</ol><p class="nav-footnote">Бесплатно. Проект сохраняется в этом браузере.</p></nav>
 <section class="workspace-center"><header class="workspace-toolbar"><div class="workspace-title"><input class="project-name" data-name aria-label="Название комплекта" maxlength="80" value="${esc(project.name)}"><span class="workspace-meta">${project.store==='apple'?'App Store':'Android'} · ${spec.workingWidth||spec.width} × ${spec.workingHeight||spec.height}</span></div><div class="canvas-tools">${step>=3?`<button class="button quiet icon-action" data-upload aria-label="Добавить экраны" title="Добавить экраны">${icon('plus')}</button><button class="button quiet icon-action" data-undo ${history.length?'':'disabled'} aria-label="Отменить" title="Отменить">${icon('undo')}</button>`:''}</div></header>
 ${step<=2?`<div class="onboarding-surface">${setupContent()}</div>`:`<div class="workspace-stage ${editable?'':'review-stage'}"><div class="filmstrip pan-area" tabindex="0" aria-label="Холст комплекта, прокрутка по горизонтали">${project.slides.map(slideCard).join('')}<button class="add-slide ${editable?'':'review-placeholder'}" data-upload ${!editable||project.slides.length>=spec.max?'disabled':''} ${editable?'':'tabindex="-1" aria-hidden="true"'}>${icon('plus')}Добавить экран</button></div><footer class="canvas-status"><span>${screenCount(project.slides.length)}</span><span>${editable?'Выбор — клик по кадру · Текст — клик по заголовку':'PNG · все экраны и размеры'}</span></footer></div>`}</section>
 <aside class="inspector"><header class="inspector-heading"><h1>${labels[step-1]}</h1><span>${step} / ${labels.length}</span></header><div class="inspector-scroll">${inspector()}</div><footer class="step-actions"><button class="button quiet" data-back ${step===1?'disabled':''}>Назад</button>${step<4?`<button class="button primary" data-next ${step===2&&!project.slides.length?'disabled':''}>${step===3?'К экспорту':step===2?'Открыть редактор':'Далее'}${icon('arrow')}</button>`:''}</footer></aside>
 </div>`;}

function render(){
 clearTimeout(selectionTimer);colorPicker?.close();
 const focused=document.activeElement,focusKey=focused?.dataset.focusKey||focused?.dataset.sizeField;
 const panelSelection=focused?.tagName==='TEXTAREA'?[focused.selectionStart,focused.selectionEnd]:null;
 const settings=root.querySelector('.inspector-scroll');if(settings)panelScroll[lastRenderedStep]=settings.scrollTop;
 const area=root.querySelector('.filmstrip');if(area)canvasScroll=[area.scrollLeft,area.scrollTop];
 const wasEditing=focused?.hasAttribute('data-inline-input'),selection=wasEditing?[focused.selectionStart,focused.selectionEnd]:null;
 if(activePhone&&!project.slides.some(v=>v.id===activePhone))activePhone=null;
 if(activeText&&!project.slides.some(v=>v.id===activeText.id))activeText=null;
 root.style.setProperty('--card-ratio',formatFor(project).width/formatFor(project).height);
 root.innerHTML=workspace();root.setAttribute('aria-busy',String(busy));root.inert=busy;
 document.body.classList.add('workspace-active');document.body.classList.toggle('editing',step===3);
 document.getElementById('save-project').hidden=!project.slides.length;document.getElementById('new-project').hidden=!project.slides.length;
 for(const b of document.querySelectorAll('.header-actions button'))b.disabled=busy;
 const nextArea=root.querySelector('.filmstrip');if(nextArea){nextArea.scrollLeft=canvasScroll[0];nextArea.scrollTop=canvasScroll[1];}
 root.querySelector('.inspector-scroll').scrollTop=panelScroll[step]||0;
 if(focusKey&&lastRenderedStep===step&&!wasEditing){const el=[...root.querySelectorAll('[data-focus-key],[data-size-field]')].find(e=>(e.dataset.focusKey||e.dataset.sizeField)===focusKey&&e.tagName===focused.tagName);el?.focus({preventScroll:true});if(panelSelection)el?.setSelectionRange(...panelSelection);}
 lastRenderedStep=step;
 // Paint in this task: a replaced canvas must never appear as a blank frame.
 paintTicket++;paint();updateIssues();
 if(focusText||(wasEditing&&activeText)){focusText=false;const el=root.querySelector('[data-inline-input]');el?.focus({preventScroll:true});if(selection)el?.setSelectionRange(...selection);}
}

function updateIssues(){const el=document.getElementById('issues');if(!el)return;const issues=exportIssues(project),ctx=document.createElement('canvas').getContext('2d');let variants;try{variants=exportFormats(project);}catch(e){issues.push(e.message);variants=[];}variants.forEach(p=>p.slides.forEach((s,i)=>{if(frameLayout(ctx,p,s).overflow)issues.push(`Слайд ${i+1}: сократите текст, чтобы он читался и помещался (${formatFor(p).workingWidth||1080}).`);}));el.hidden=!issues.length;el.textContent=issues.join(' ');const button=root.querySelector('[data-export]');if(button)button.disabled=busy||issues.length>0;}
function schedulePaint(){const ticket=++paintTicket;requestAnimationFrame(()=>{if(ticket===paintTicket)paint();});}
function paint(){
 for(const canvas of root.querySelectorAll('[data-slide-canvas]')){const i=project.slides.findIndex(v=>v.id===canvas.dataset.slideCanvas),slide=project.slides[i];if(!slide)continue;const shell=canvas.parentElement;let l;try{l=renderSlide(canvas,project,slide,images.get(screenFor(slide,project.locale).image),i,{scale:.55,backgroundImage:images.get(project.background.asset?.image)});shell.querySelector('.phone-render-error')?.remove();}catch(error){l=frameLayout(canvas.getContext('2d'),project,slide);let warning=shell.querySelector('.phone-render-error');if(!warning){warning=document.createElement('p');warning.className='phone-render-error';warning.setAttribute('role','alert');shell.append(warning);}warning.textContent=is3D(project,slide)?'3D недоступен в этом браузере. Выберите 2D в настройках мокапа или откройте проект в браузере с WebGL.':error.message;}const factor=shell.clientWidth/l.w;const hit=shell.querySelector('[data-phone-hit]'),p=l.phone.hitBounds||l.phone;if(hit)Object.assign(hit.style,{left:p.x/l.w*100+'%',top:p.y/l.h*100+'%',width:p.width/l.w*100+'%',height:p.height/l.h*100+'%',transform:'rotate('+(l.phone.hitBounds?0:l.phone.rotation||0)+'deg)'});
 for(const el of shell.querySelectorAll('[data-inline],[data-inline-input]')){const field=el.dataset.inline||el.dataset.text,heading=field==='title',text=heading?l.title:l.sub,lineHeight=text.lineHeight/text.size,y=heading&&!slide.title&&!slide.composition?8:heading?l.titleY:l.subtitleY,box=heading?l.titleBox:l.subBox;Object.assign(el.style,{left:(box.x/l.w*100)+'%',top:(y/l.h*100)+'%',width:(box.width/l.w*100)+'%',textAlign:box.align,height:(Math.max(text.size*lineHeight,text.lines.length*text.size*lineHeight)+6)*factor+'px',fontSize:text.size*factor+'px',fontWeight:heading?'700':'400',lineHeight:String(lineHeight),opacity:String((heading?1:.8)*project.textOpacity),color:displayedTextColor(),caretColor:displayedTextColor()});}
 }
}

async function addFiles(files){
  if(busy)return;const list=[...files];if(!list.length)return;
  const available=replaceId?1:Math.max(0,STORES[project.store].max-project.slides.length);
  if(list.length>available){notice(replaceId?'Для замены выберите один экран.':`Можно добавить ещё ${available} экранов. Выберите меньше файлов.`,true);replaceId=null;return;}
  busy=true;const target=replaceId;replaceId=null;render();notice('Загружаем экраны…');
  try{
    const uploaded=[];for(const file of list){const media=await readScreenshot(file);uploaded.push({...media,name:file.name});}
    const next=clone(project);
    if(target){const s=next.slides.find(s=>s.id===target);if(!s)throw new Error('Слайд уже удалён.');putScreen(s,next.locale,{image:uploaded[0].source,name:uploaded[0].name,width:uploaded[0].width,height:uploaded[0].height});}
    else for(const m of uploaded)next.slides.push({...createSlide(m.source,m.name,m.width,m.height,next.slides.length),titleSize:next.slides[0]?.titleSize??34,subtitleSize:next.slides[0]?.subtitleSize??17});
    validateProject(next);for(const m of uploaded)images.set(m.source,m.image);
    changed(()=>project=next);notice(target?'Экран заменён. Тексты и оформление сохранены.':`Добавлено экранов: ${uploaded.length}.`);
  }catch(error){notice(error.message,true);}finally{busy=false;screensInput.value='';render();}
}
function chooseScreens(id=null){if(busy)return;replaceId=id;screensInput.multiple=!id;screensInput.click();}
async function exportPack(){
  if(busy||exportIssues(project).length)return;
  let variants;try{variants=exportFormats(project);}catch(e){notice(e.message,true);return;}
  if(variants.some(hasExamples)&&!await dialog('В комплекте остались тексты-примеры','Их можно заменить прямо на кадрах. Скачать изображения с этими текстами?',{confirm:'Скачать как есть',cancel:'Изменить тексты'})){const example=project.slides.find(s=>hasExamples({...project,slides:[s]}));step=3;startInline(example.id,example.titleExample&&example.title?'title':'subtitle');revealSlide(example.id);autosave.changed();return;}
  activeText=null;
  const ctx=document.createElement('canvas').getContext('2d');if(variants.some(p=>p.slides.some(s=>frameLayout(ctx,p,s).overflow))){notice('Сократите длинные заголовки перед экспортом.',true);return;}
  busy=true;readyDownload=null;render();const snapshot=clone(project),files=[];
  try{
    await cacheImages(snapshot);
    const jobs=freePackEntries(snapshot);for(const {variant,slide,index,name} of jobs){
      const canvas=document.createElement('canvas');renderSlide(canvas,variant,slide,images.get(screenFor(slide,variant.locale).image),index,{scale:snapshot.store==='apple'?snapshot.exportScale/3:1,backgroundImage:images.get(variant.background.asset?.image)});
      const blob=await pngBlob(canvas);files.push({name,data:new Uint8Array(await blob.arrayBuffer())});canvas.width=canvas.height=1;
      const button=root.querySelector('[data-export]');if(button)button.textContent=`Готовим ${files.length} из ${jobs.length}…`;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    readyDownload={count:files.length,description:snapshot.store==='apple'?(snapshot.exportScale===3?'1320 × 2868 и 1242 × 2688':'440 × 956 и 414 × 896'):'1080 × 1920',blob:makeZip(files),name:`${slug(snapshot.name)}-${snapshot.store}.zip`};saveBlob(readyDownload.blob,readyDownload.name);notice('Комплект готов. PNG собраны в один ZIP.');
  }catch(error){notice(error.message||'Не удалось подготовить комплект. Попробуйте снова.',true);}finally{busy=false;render();}
}
root.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||busy)return;if(el.hasAttribute('data-phone-hit')){if(step!==3)return;if(Date.now()<suppressClickUntil)return;activeText=null;activePhone=el.dataset.phoneHit;selectedSlideId=activePhone;render();revealControl('.pose-controls');}
 if(el.hasAttribute('data-format'))changed(()=>project.appleFormat=el.dataset.format);
 if(el.hasAttribute('data-content-order'))return changed(()=>selectedSlide().contentOrder=el.dataset.contentOrder);
 if(el.hasAttribute('data-pose-mode'))return changed(()=>{const s=selectedSlide();s.phonePose={...DEFAULT_POSE,...s.phonePose,mode:el.dataset.poseMode};});
 if(el.hasAttribute('data-reset-pose'))return changed(()=>selectedSlide().phonePose={...DEFAULT_POSE,rotation:0});
 if(el.hasAttribute('data-auto-text'))changed(()=>{project.textColor=null;project.textOpacity=1;});
 if(el.hasAttribute('data-screen-fit')&&activePhone)changed(()=>screenSettings(project.slides.find(s=>s.id===activePhone),project.locale).screenFit=el.dataset.screenFit);
 if(el.hasAttribute('data-reset-screen')&&activePhone)changed(()=>Object.assign(screenSettings(project.slides.find(s=>s.id===activePhone),project.locale),{screenFit:'cover',screenScale:1,screenX:0,screenY:0}));
});
root.addEventListener('input',e=>{if(busy)return;const el=e.target;if(el.hasAttribute('data-pose')&&activePhone){changed(()=>selectedSlide().phonePose[el.dataset.pose]=+el.value,{remember:false,rebuild:false});root.querySelector(`[data-pose-output="${el.dataset.pose}"]`).textContent=el.value;}if(el.hasAttribute('data-screen')&&activePhone){changed(()=>screenSettings(project.slides.find(s=>s.id===activePhone),project.locale)[el.dataset.screen]=+el.value/100,{remember:false,rebuild:false});root.querySelector(`[data-screen-output="${el.dataset.screen}"]`).textContent=el.value+'%';}});
root.addEventListener('click',async event=>{
  const el=event.target.closest('button');if(!el||busy||(Date.now()<suppressClickUntil&&el.closest('.pan-area')))return;
  if(el.hasAttribute('data-inline')&&step===3)return startInline(el.dataset.id,el.dataset.inline);
  if(el.hasAttribute('data-end-text')){activeText=null;activePhone=null;render();return;}
  if(el.hasAttribute('data-open-color'))return openColor(el.dataset.openColor,el);
  if(el.hasAttribute('data-reset-device-color'))return changed(()=>project.deviceColor=null);
  if(el.hasAttribute('data-bg-mode'))return changed(()=>project.background.mode=el.dataset.bgMode);
  if(el.hasAttribute('data-store'))return changed(()=>project.store=el.dataset.store);
  if(el.hasAttribute('data-frame'))return changed(()=>project.frame=el.dataset.frame);
  if(el.hasAttribute('data-layout'))return changed(()=>project.layout=el.dataset.layout);

  if(el.hasAttribute('data-generate-copy'))return openContentCopy({project,images,getRevision:()=>revision,onApply:next=>{changed(()=>project=next);notice('Тексты обновлены. Их можно править на кадрах или отменить.');}});
  if(el.hasAttribute('data-next')){goStep(step+1);return;}
  if(el.hasAttribute('data-back')){goStep(step-1);return;}
  if(el.hasAttribute('data-upload'))return chooseScreens();
  if(el.hasAttribute('data-replace'))return chooseScreens(el.dataset.replace);
  if(el.hasAttribute('data-remove')){const s=project.slides.find(s=>s.id===el.dataset.remove);if(!s)return;if((s.title||s.subtitle)&&!await dialog('Удалить слайд?','Экран и его тексты будут удалены из комплекта. Действие можно отменить.',{confirm:'Удалить'}))return;return changed(()=>{project.slides=project.slides.filter(s=>s.id!==el.dataset.remove);});}
  if(el.hasAttribute('data-move'))return changed(()=>{const i=project.slides.findIndex(s=>s.id===el.dataset.move);moveSlide(project,i,i+Number(el.dataset.direction));});
  if(el.hasAttribute('data-undo')){const previous=history.pop();if(previous)changed(()=>project=previous,{remember:false});return;}
  if(el.hasAttribute('data-export'))return exportPack();
  if(el.hasAttribute('data-download')&&readyDownload)return saveBlob(readyDownload.blob,readyDownload.name);
  if(el.hasAttribute('data-slide-canvas'))document.getElementById('title-'+el.dataset.slideCanvas)?.focus();
});
root.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.hasAttribute('data-slide-canvas')){event.preventDefault();event.target.click();}});
root.addEventListener('focusin',event=>{if(event.target.matches('[data-composition]'))checkpoint();if(event.target.matches('[data-text]'))textEditCheckpoint=true;if(event.target.matches('[data-name],[data-phone],[data-screen],[data-angle],[data-size-field],[data-pose]'))checkpoint();if(activeText&&event.target.matches('[data-panel-text]')){activeText=null;render();}});
root.addEventListener('input',e=>{const el=e.target;if(busy)return;if(el.hasAttribute('data-size-field')&&el.value!==''&&el.validity.valid)changed(()=>setFontSize(project,el.dataset.sizeField,+el.value),{remember:false,rebuild:false});});
root.addEventListener('click',e=>{const el=e.target.closest('button');if(!el||busy)return;if(el.hasAttribute('data-size-step')){const field=el.dataset.sizeField;changed(()=>setFontSize(project,field,(selectedSlide()?.[field+'Size']??(field==='title'?34:17))+Number(el.dataset.sizeStep)));}});

root.addEventListener('input',event=>{
  if(busy)return;const el=event.target;
  if(el.hasAttribute('data-text')){colorPicker?.close();root.querySelectorAll(`[data-text="${el.dataset.text}"][data-id="${el.dataset.id}"]`).forEach(other=>{if(other!==el)other.value=el.value;});const s=project.slides.find(s=>s.id===el.dataset.id);if(!s)return;changed(()=>{const field=el.dataset.text;s[field+'Marks']=editMarks(marksFor(s,field),s[field],el.value);s[field+'Highlight']='';s[field]=el.value;s[field+'Example']=false;},{remember:textEditCheckpoint,rebuild:false});textEditCheckpoint=false;if(!((s.titleExample&&s.title)||(project.subtitleEnabled&&s.subtitleExample&&s.subtitle)))el.closest('.slide-card')?.querySelector('.example-tag')?.remove();const count=root.querySelector(`[data-count="${s.id}-${el.dataset.text}"]`);if(count)count.textContent=`${el.value.length}/${el.dataset.text==='title'?90:160}`;}
  if(el.hasAttribute('data-name'))changed(()=>project.name=el.value,{remember:false,rebuild:false});
  if(el.hasAttribute('data-phone')){changed(()=>{if(project.phoneScale==null)project.phoneScale=1;project[el.dataset.phone]=Number(el.value)/100;},{remember:false,rebuild:false});root.querySelector(`[data-phone-output="${el.dataset.phone}"]`).textContent=el.value+'%';}
  if(el.hasAttribute('data-angle')){changed(()=>project.background.angle=Number(el.value),{remember:false,rebuild:false});root.querySelector('[data-angle-output]').textContent=el.value+'°';}
  if(el.hasAttribute('data-color'))changed(()=>project.background.colors[+el.dataset.color]=el.value,{remember:false,rebuild:false});
});
root.addEventListener('change',event=>{if(busy)return;const el=event.target;if(el.hasAttribute('data-align-phones'))changed(()=>project.phoneAlignment=el.checked?'shared':'text');if(el.hasAttribute('data-subtitle-toggle'))changed(()=>project.subtitleEnabled=el.checked);if(el.hasAttribute('data-gradient'))changed(()=>project.background.mode=el.checked?'gradient':'solid');if(el.hasAttribute('data-store-select'))changed(()=>project.store=el.value);if(el.hasAttribute('data-device-select')&&Object.hasOwn(project.store==='apple'?IPHONE_DEVICES:ANDROID_DEVICES,el.value))changed(()=>project[project.store==='apple'?'iphoneDevice':'androidDevice']=el.value);});
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
    changed(()=>{project=next;step=3;activeText=null;activePhone=null;selectedSlideId=null;canvasScroll=[0,0];panelScroll={};root.replaceChildren();});notice('Проект открыт.');
  }catch(error){if(error.name==='LegacyProjectError')await dialog('Проект предыдущей версии',error.message,{confirm:'Понятно',cancel:'Закрыть'});else notice(error instanceof SyntaxError?'Не удалось прочитать файл проекта.':error.message,true);}
});
document.getElementById('new-project').addEventListener('click',async()=>{if(busy)return;if(!await dialog('Начать новый комплект?','Текущий комплект останется в скачанном файле, если вы его сохранили. Новый комплект заменит локальное автосохранение.',{confirm:'Начать заново'}))return;changed(()=>{project=createProject();step=1;activeText=null;activePhone=null;selectedSlideId=null;canvasScroll=[0,0];panelScroll={};root.replaceChildren();});notice('Можно создавать новый комплект.');});
window.addEventListener('beforeunload',event=>{if(autosave.hasUnsaved()){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')autosave.flush();});

root.addEventListener('pointerdown',event=>{
 const area=event.target.closest('.pan-area');if(!area||busy)return;
 if(samplingColor!==null){const canvas=event.target.closest('.canvas-shell')?.querySelector('canvas')||event.target.closest('canvas');if(canvas){const r=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-r.left)*canvas.width/r.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-r.top)*canvas.height/r.height))),rgb=canvas.getContext('2d').getImageData(x,y,1,1).data,color='#'+[...rgb].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');if(samplingColor.apply)samplingColor.apply(color);else setColor(samplingColor.target,color,samplingColor.id);samplingColor=null;root.classList.remove('sampling');suppressClickUntil=Date.now()+350;render();notice('Цвет выбран.');}event.preventDefault();return;}
 if(event.pointerType!=='mouse'||event.button!==0||event.target.closest('input,textarea,select,[data-drag],button:not([data-inline]):not([data-phone-hit])'))return;
 panState={area,x:event.clientX,y:event.clientY,left:area.scrollLeft,top:area.scrollTop,target:event.target.closest('[data-inline],[data-phone-hit]'),moved:false,id:event.pointerId};
});
root.addEventListener('pointermove',event=>{if(!panState||event.pointerId!==panState.id)return;const dx=event.clientX-panState.x,dy=event.clientY-panState.y;if(Math.abs(dx)+Math.abs(dy)>5&&!panState.moved){panState.moved=true;panState.area.setPointerCapture(event.pointerId);panState.area.classList.add('panning');}if(panState.moved){event.preventDefault();panState.area.scrollLeft=panState.left-dx;panState.area.scrollTop=panState.top-dy;}});
function endPan(){if(panState?.moved){suppressClickUntil=Date.now()+350;panState.area.classList.remove('panning');if(panState.area.hasPointerCapture(panState.id))panState.area.releasePointerCapture(panState.id);}panState=null;}
root.addEventListener('pointerup',endPan);root.addEventListener('pointercancel',endPan);window.addEventListener('pointerup',endPan);
window.addEventListener('resize',schedulePaint);
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){samplingColor=null;root.classList.remove('sampling');if(activeText||activePhone){activeText=null;activePhone=null;render();}}});

try{await autosave.start();render();}catch(error){root.textContent='Не удалось открыть редактор. Обновите страницу.';notice(error.message,true);}

root.addEventListener('input',event=>{
 if(busy||!event.target.hasAttribute('data-composition'))return;
 const s=selectedSlide();if(!s?.composition)return;
 changed(()=>setCompositionValue(s.composition,event.target.dataset.composition,Number(event.target.value)),{remember:false,rebuild:false});
});
root.addEventListener('change',event=>{
 if(busy)return;const e=event.target;
 if(e.hasAttribute('data-composition-slide')){activeText=null;activePhone=null;selectedSlideId=e.value;render();}
 if(e.hasAttribute('data-composition'))render();
});
root.addEventListener('click',event=>{
 if(busy)return;const e=event.target.closest('button');if(!e)return;
 if(e.hasAttribute('data-reset-compositions')){changed(()=>{for(const s of project.slides)s.composition=null;project.phoneAlignment='shared';project.phoneScale=1;project.phoneY=0;});return;}
 const s=selectedSlide();if(!s?.composition)return;
 if(e.hasAttribute('data-composition-align')){const [field,align]=e.dataset.compositionAlign.split(':');changed(()=>s.composition[field].align=align);}
 if(e.hasAttribute('data-remove-decoration'))changed(()=>s.composition.decorations.splice(Number(e.dataset.removeDecoration),1));
 if(e.hasAttribute('data-decoration-color')){
  const id=s.id,index=Number(e.dataset.decorationColor),locale=project.locale;const d=s.composition.decorations[index];if(!d)return;
  colorPicker?.close();document.getElementById('color-title').textContent='Цвет графики';checkpoint();
  colorPicker=mountColorPicker({dialog:document.getElementById('color-dialog'),anchor:e,value:d.color,onChange:value=>{
   if(project.locale!==locale||selectedSlide()?.id!==id)return;
   const target=project.slides.find(s=>s.id===id)?.composition?.decorations[index];if(target){changed(()=>target.color=value,{remember:false,rebuild:false});e.querySelector('i').style.background=value;}
  },onSample:()=>{samplingColor={apply:value=>{if(project.locale!==locale)return;const target=project.slides.find(s=>s.id===id)?.composition?.decorations[index];if(target)changed(()=>target.color=value,{remember:false,rebuild:false});}};root.classList.add('sampling');notice('Нажмите на нужный цвет на кадре.');}});
 }
});
