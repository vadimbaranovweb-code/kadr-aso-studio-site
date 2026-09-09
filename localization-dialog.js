import {clone} from './model.js';
import {LOCALES,localeLabel,activeLocale,localeList,localeProject,localeEntries,ensureLocalization,addLocale,switchLocale,removeLocale,reviewLocale,setLocaleBrief,localeStatus,translationPrompt,parseTranslation,applyTranslation,exportLocaleProject,localeDraftKey,createLocaleTextDraft,localeDraftChanges,applyLocaleTextDraft} from './localization.js';
import {versionLabel} from './project-versions.js';
import {checkTextLayouts} from './text-workbook.js';
import {createFrameRenderer} from './panorama-render.js';
const $=id=>document.getElementById(id),node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const briefKeys=['product','audience','benefits','tone','terms','claims'];
export function createLocalizationDialog({getProject,getView,onApply,loadImages,images,download,onUI,onExport,onCanvas,onClose,notify}){
  const dialog=$('localization-dialog'),measure=document.createElement('canvas').getContext('2d'),sessions=new Map(),briefs=new Map();
  let pending=false,session=null,brief=null,generation=0,reviewError=false;
  const textDirty=s=>Boolean(s&&(localeDraftChanges(s.draft)||s.raw.trim()||s.packet));
  function activate(){
    const p=getProject(),code=activeLocale(p),key=localeDraftKey(p,code),bkey=localeDraftKey(p,p.localization?.source??code);
    session=sessions.get(key);if(!session){session={draft:createLocaleTextDraft(p,code),raw:'',parsedRaw:'',packet:null,step:1};sessions.set(key,session);}else if(!textDirty(session))session.draft=createLocaleTextDraft(p,code);
    session.draft.key=key;
    brief=briefs.get(bkey);if(!brief){brief={values:clone(p.localization?.brief??Object.fromEntries(briefKeys.map(k=>[k,'']))),dirty:false};briefs.set(bkey,brief);}else if(!brief.dirty)brief.values=clone(p.localization?.brief??Object.fromEntries(briefKeys.map(k=>[k,''])));
  }
  function error(message=''){$('locale-error').textContent=message;$('locale-error').hidden=!message;}
  function disabled(){
    dialog.querySelectorAll('button,input,select,textarea').forEach(e=>e.disabled=pending);
    if(pending)return;
    const p=getProject(),source=p.localization?.source??activeLocale(p),isSource=activeLocale(p)===source;
    $('locale-source').disabled=Boolean(p.localization);$('locale-add').disabled=!$('locale-add-code').options.length;
    $('locale-back').disabled=session.step===1;
    $('locale-main').disabled=session.step===3&&(!$('locale-review-ready').checked||reviewError);
    $('locale-review-ready').disabled=reviewError;
    for(const id of ['locale-copy-prompt','locale-show-prompt','locale-prompt','locale-check-answer','locale-import-file'])$(id).disabled=isSource;
    dialog.querySelectorAll('[data-locale-locked]').forEach(e=>e.disabled=e.dataset.localeLocked==='true');
    $('locale-reset-draft').disabled=!textDirty(session);
  }
  function draftStatus(){
    const count=localeDraftChanges(session.draft),pendingAnswer=session.raw.trim()&&session.raw!==session.parsedRaw;
    $('locale-draft-state').textContent=pendingAnswer?'Ответ ещё не подставлен. Нажми «Подставить перевод в поля», затем примени его.':count?`Изменено полей: ${count}. Нажми «Применить и проверить», чтобы обновить ${localeLabel(session.draft.code)}.`:'Можно редактировать тексты прямо здесь. Затем нажми «Применить и проверить».';
    $('locale-progress').textContent=textDirty(session)||brief.dirty?'Есть неприменённый черновик · он сохраняется при переходах в этой вкладке.':'';
    disabled();
  }
  async function commit(fn){
    if(pending)return false;pending=true;disabled();error();
    try{const base=getProject(),result=fn(base),next=result.project??result;await onApply(next,result.view??getView(),base);return true;}
    catch(e){error(e.message);return false;}finally{pending=false;disabled();}
  }
  function rows(){
    const p=getProject(),source=p.localization?.source??activeLocale(p),origin=new Map(localeEntries(localeProject(p,source)).map(e=>[e.key,e])),host=$('locale-copy-fields');host.replaceChildren();
    const originalLanguage=localeLabel(source),targetLanguage=localeLabel(activeLocale(p));
    $('locale-editor-caption').textContent=activeLocale(p)===source?`Тексты · ${targetLanguage}`:`${originalLanguage} → ${targetLanguage}`;
    $('locale-editor-help').textContent=activeLocale(p)===source?'Здесь можно исправить исходные тексты. После применения проверь существующие переводы.':'Впиши готовый перевод справа. Кнопка внизу применит его ко всем кадрам этого языка.';
    for(const [i,e] of session.draft.entries.entries()){
      const row=node('article',undefined,'locale-copy-row');row.append(node('h4',`Кадр ${e.frame} · ${e.name}`));
      const original=node('div',undefined,'locale-copy-original');original.append(node('span',originalLanguage,'locale-column-label'),node('p',origin.get(e.key)?.text??'Для этого слоя нет исходного текста.'));original.lang=source;
      const target=node('div',undefined,'locale-copy-target'),label=node('label',targetLanguage),input=node('textarea');input.id=`locale-copy-${i}`;label.htmlFor=input.id;input.value=e.text;input.maxLength=1000;input.rows=3;input.lang=activeLocale(p);input.spellcheck=true;input.dataset.localeLocked=String(e.locked);
      input.oninput=()=>{e.text=input.value;draftStatus();};target.append(label,input);
      const details=node('details',undefined,'locale-highlight-field'),summary=node('summary','Выделенная фраза'),hlLabel=node('label','Выделение в тексте'),highlight=node('input');highlight.id=`locale-highlight-${i}`;highlight.value=e.highlight;highlight.maxLength=100;highlight.lang=activeLocale(p);highlight.dataset.localeLocked=String(e.locked);hlLabel.htmlFor=highlight.id;highlight.oninput=()=>{e.highlight=highlight.value;draftStatus();};details.open=Boolean(e.highlight);details.append(summary,hlLabel,highlight);target.append(details);
      if(e.locked)target.append(node('p','Слой заблокирован. Разблокируй его в Pro.','workflow-note'));
      row.append(original,target);host.append(row);
    }
  }
  function cards(){
    const p=getProject(),host=$('locale-list');host.replaceChildren();if(!p.localization)return;
    for(const entry of localeList(p)){
      const card=node('article',undefined,'locale-card'),status=localeStatus(p,entry.code);card.append(node('h3',`${localeLabel(entry.code)}${entry.current?' · открыт':''}`),node('p',status.label,'locale-state'));
      const actions=node('div',undefined,'locale-card-actions');
      function button(label,fn){const b=node('button',label,'button');b.onclick=fn;actions.append(b);}
      button(entry.current?'Перейти к текстам':entry.code===p.localization.source?'Открыть исходный язык':'Редактировать перевод',async()=>{
        if(!entry.current){if(!await commit(q=>switchLocale(q,entry.code,getView())))return;activate();}
        session.step=2;render();
      });
      button('Скачать проект языка',()=>{try{const payload=JSON.stringify(exportLocaleProject(getProject(),entry.code));if(payload.length>210*1024*1024)throw new Error('Файл языка больше 210 МБ.');download(new Blob([payload],{type:'application/json'}),`${entry.code}.kadr.json`);}catch(e){error(e.message);}});
      if(p.localization&&!entry.current&&entry.code!==p.localization.source)button('Удалить язык',async()=>{if(await commit(q=>removeLocale(q,entry.code)))render();});
      card.append(actions);host.append(card);
    }
  }
  async function review(){
    const run=++generation;reviewError=true;disabled();$('locale-review-report').textContent='Проверяем кадры и переносы…';$('locale-review-frames').replaceChildren();
    try{
      const p=getProject(),content=localeProject(p,activeLocale(p)),format=$('locale-review-format').value;
      await loadImages(content);if(run!==generation||!dialog.open)return;
      const report=checkTextLayouts(content,images,measure),issues=report.flatMap(r=>Object.entries(r.formats).flatMap(([f,v])=>v.issues.map(i=>`${f}: ${i.message}`)));
      const draw=createFrameRenderer(content,images);let errors=0;
      for(const [i,frame] of content.frames.entries()){
        const figure=node('figure'),canvas=node('canvas'),result=draw(canvas,frame,format,.6);errors+=result.errors.length;canvas.setAttribute('aria-label',`Кадр ${i+1} · ${localeLabel(activeLocale(p))}`);
        const caption=node('figcaption'),open=node('button',`Кадр ${i+1} · править в Pro`,'text-button');open.onclick=()=>{session.step=3;dialog.close();onCanvas(frame.id,format);};caption.append(open);figure.append(canvas,caption);$('locale-review-frames').append(figure);
      }
      reviewError=Boolean(errors);$('locale-review-report').textContent=errors?'Не удалось отрисовать мокап. Открой кадр в Pro и проверь настройки 3D перед экспортом.':issues.length?`Есть замечания к тексту (${issues.length}). ${issues.slice(0,4).join(' · ')}`:'В обоих размерах текст в границах холста. Проверь смысл, читаемость и язык UI.';
      $('locale-review-ready').checked=localeStatus(p,activeLocale(p)).reviewed;
    }catch(e){if(run===generation){reviewError=true;$('locale-review-report').textContent=e.message;}}
    finally{if(run===generation)disabled();}
  }
  function render(){
    const p=getProject();activate();generation++;error();
    $('locale-step-context').textContent=`${versionLabel(p)} · ${localeLabel(activeLocale(p))}`;
    $('locale-source').replaceChildren(...LOCALES.map(([c,l])=>new Option(l,c)));$('locale-source').value=p.localization?.source??'en';
    $('locale-add-code').replaceChildren(...LOCALES.filter(([c])=>!localeList(p).some(v=>v.code===c)).map(([c,l])=>new Option(l,c)));
    if([...$('locale-add-code').options].some(o=>o.value==='es-ES'))$('locale-add-code').value='es-ES';
    document.querySelectorAll('[data-locale-step]').forEach(e=>{if(Number(e.dataset.localeStep)===session.step)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
    document.querySelectorAll('[data-locale-pane]').forEach(e=>e.hidden=Number(e.dataset.localePane)!==session.step);
    $('locale-main').textContent=['','К текстам','Применить и проверить','Отметить готовым и экспортировать'][session.step];
    $('locale-footer-note').textContent=session.step===2?`Применение обновит оба размера только для ${localeLabel(activeLocale(p))}.`:session.step===3?'После проверки выберем языки и размеры в общем окне экспорта.':'У каждого языка свои тексты, изображения UI и оформление.';
    cards();rows();for(const k of briefKeys)$(`locale-brief-${k}`).value=brief.values[k]??'';
    $('locale-answer').value=session.raw;$('locale-assist-status').textContent=session.packet?'Ответ подставлен в поля. Проверь его и нажми «Применить и проверить».':'';
    $('locale-assist').hidden=activeLocale(p)===(p.localization?.source??activeLocale(p));
    $('locale-prompt-text').hidden=true;draftStatus();
    if(session.step===3)review();
  }
  async function go(step){
    if(pending)return;
    if(step===3&&textDirty(session)){error('Сначала нажми «Применить и проверить» на шаге текстов.');return;}
    if(step===2&&!getProject().localization){if(!await commit(p=>ensureLocalization(p,$('locale-source').value,{},getView())))return;activate();}
    session.step=step;render();dialog.querySelector('.locale-body').scrollTop=0;
  }
  document.querySelectorAll('[data-locale-step]').forEach(b=>b.onclick=()=>go(Number(b.dataset.localeStep)));
  $('locale-source').onchange=()=>{$('locale-add-code').replaceChildren(...LOCALES.filter(([c])=>c!==$('locale-source').value).map(([c,l])=>new Option(l,c)));};
  $('locale-add').onclick=async()=>{const code=$('locale-add-code').value,source=$('locale-source').value;if(await commit(p=>addLocale(p,code,getView(),source))){activate();session.step=2;render();notify('Язык добавлен. Внеси перевод и нажми «Применить и проверить».');}};
  $('locale-back').onclick=()=>go(Math.max(1,session.step-1));
  $('locale-main').onclick=async()=>{
    if(session.step===1)return go(2);
    if(session.step===2){
      if(session.raw.trim()&&session.raw!==session.parsedRaw)return error('Сначала нажми «Подставить перевод в поля» в блоке ChatGPT/Claude.');
      const saved=session;
      const ok=await commit(p=>{
        if(saved.packet){const packet=clone(saved.packet),byKey=new Map(saved.draft.entries.map(e=>[e.key,e]));packet.entries.forEach(e=>{const d=byKey.get(e.key);e.text=d.text;e.highlight=d.highlight;});return applyTranslation(p,packet);}
        return applyLocaleTextDraft(p,saved.draft).project;
      });
      if(ok){saved.raw='';saved.parsedRaw='';saved.packet=null;saved.draft=createLocaleTextDraft(getProject());saved.step=3;render();dialog.querySelector('.locale-body').scrollTop=0;notify(`Тексты применены к ${localeLabel(activeLocale(getProject()))}. Проверь готовые кадры.`);}
    }else{
      if(!$('locale-review-ready').checked||reviewError)return;
      const code=activeLocale(getProject());if(await commit(p=>reviewLocale(ensureLocalization(p),code,true))){dialog.close();onExport([code]);}
    }
  };
  $('locale-ui').onclick=()=>{session.step=2;dialog.close();onUI();};
  $('locale-reset-draft').onclick=()=>{session.draft=createLocaleTextDraft(getProject());session.raw='';session.parsedRaw='';session.packet=null;render();};
  for(const k of briefKeys)$(`locale-brief-${k}`).oninput=e=>{brief.values[k]=e.target.value;brief.dirty=true;draftStatus();};
  async function saveBrief(){const saved=brief;if(await commit(p=>setLocaleBrief(p,saved.values,p.localization?.source??'en',getView()))){saved.dirty=false;draftStatus();return true;}return false;}
  $('locale-save-brief').onclick=async()=>{if(await saveBrief())$('locale-assist-status').textContent='Контекст сохранён.';};
  $('locale-reset-brief').onclick=()=>{brief.dirty=false;render();};
  async function prompt(){if(brief.dirty&&!await saveBrief())return null;return translationPrompt(getProject(),activeLocale(getProject()));}
  $('locale-show-prompt').onclick=async()=>{try{const text=await prompt();if(text!==null){$('locale-prompt-text').value=text;$('locale-prompt-text').hidden=false;}}catch(e){error(e.message);}};
  $('locale-copy-prompt').onclick=async()=>{try{const text=await prompt();if(text===null)return;try{await navigator.clipboard.writeText(text);$('locale-assist-status').textContent='Задание скопировано. Вставь его в ChatGPT или Claude.';}catch{$('locale-prompt-text').value=text;$('locale-prompt-text').hidden=false;$('locale-prompt-text').focus();$('locale-prompt-text').select();$('locale-assist-status').textContent='Задание выделено. Скопируй его с помощью ⌘C / Ctrl+C.';}}catch(e){error(e.message);}};
  $('locale-prompt').onclick=async()=>{try{const text=await prompt();if(text!==null)download(new Blob([text],{type:'text/plain;charset=utf-8'}),`aso-localization-${activeLocale(getProject())}.txt`);}catch(e){error(e.message);}};
  $('locale-answer').oninput=e=>{session.raw=e.target.value;draftStatus();};
  $('locale-check-answer').onclick=()=>{
    try{
      if(brief.dirty)throw new Error('Сохрани контекст перед проверкой ответа.');
      const packet=parseTranslation(getProject(),session.raw);if(packet.targetLocale!==activeLocale(getProject()))throw new Error(`Ответ предназначен для ${localeLabel(packet.targetLocale)}. Открой этот язык и вставь ответ там.`);
      applyTranslation(getProject(),packet);const byKey=new Map(packet.entries.map(e=>[e.key,e]));session.draft=createLocaleTextDraft(getProject());
      session.draft.entries.forEach(e=>{const v=byKey.get(e.key);e.text=v.text;e.highlight=v.highlight;});session.packet=packet;session.parsedRaw=session.raw;
      rows();error();$('locale-assist').open=false;draftStatus();$('locale-assist-status').textContent='Перевод подставлен. Примени его кнопкой внизу.';dialog.querySelector('.locale-body').scrollTop=0;
    }catch(e){error(e.message);}
  };
  $('locale-import-file').onclick=()=>$('locale-json-input').click();
  $('locale-json-input').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1000000)throw new Error('Файл ответа должен быть до 1 МБ.');session.raw=await f.text();$('locale-answer').value=session.raw;$('locale-check-answer').click();}catch(e){error(e.message);}finally{e.target.value='';}};
  $('locale-review-format').onchange=()=>review();$('locale-review-ready').onchange=disabled;
  function close(){if(!pending)dialog.close();}
  $('locale-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>{generation++;onClose();});
  window.addEventListener('beforeunload',e=>{if([...sessions.values()].some(textDirty)||[...briefs.values()].some(b=>b.dirty)||pending){e.preventDefault();e.returnValue='';}});
  function adoptVersions(before,after){
    if(before.versions||!after.versions)return;
    // The first saved entry is the previously unversioned work. Keep its draft
    // reachable under both identities so undoing version creation also retains it.
    const original=after.versions.saved[0]??after.versions.active;
    for(const {code} of localeList(before)){
      const oldKey=localeDraftKey(before,code),newKey=`${original.id}:${code}`;
      if(sessions.has(oldKey))sessions.set(newKey,sessions.get(oldKey));
      if(briefs.has(oldKey))briefs.set(newKey,briefs.get(oldKey));
    }
  }
  return {adoptVersions,open(){if(dialog.open)return;activate();reviewError=false;render();dialog.showModal();if(session.step===3)review();}};
}
