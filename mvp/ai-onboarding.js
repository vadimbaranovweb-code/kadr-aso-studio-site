import {LOCALES,cloneProject} from './model.js';
import {readScreenshot} from './media.js';

const stages={prepare:'Готовим ваши экраны',copy:'Создаём заголовки и подзаголовки','reference-copy':'Создаём тексты и оформление по референсу',reference:'Собираем оформление по референсу',artwork:'Генерируем графический фон',finish:'Открываем готовый комплект'};
// Temporary form state is deliberately outside project/recovery and never contains a key.
export function createAIOnboarding({ai,getProject,getRevision,onBusy,onApply,onContinue,onChange}){
 const panel=document.createElement('div');panel.className='ai-onboarding';
 panel.innerHTML=`<section class="ai-key-card" data-ai-connection-host></section>
 <div class="ai-options">
  <section class="ai-choice"><label class="switch-label"><span><strong>Сгенерировать тексты</strong><small>Заголовки и подзаголовки по содержимому ваших экранов</small></span><input type="checkbox" role="switch" data-copy aria-label="Сгенерировать тексты"></label>
   <div class="ai-choice-detail" data-copy-options hidden><label class="ai-language">Язык текстов<select aria-label="Язык текстов">${Object.entries(LOCALES).filter(([l])=>l!=='source').map(([l,n])=>`<option value="${l}" ${l==='en'?'selected':''}>${n}</option>`).join('')}</select></label></div>
  </section>
  <section class="ai-choice"><label class="switch-label"><span><strong>Собрать по референсу</strong><small>Расположение, цвета и акценты по вашим примерам</small></span><input type="checkbox" role="switch" data-reference aria-label="Собрать по референсу"></label>
   <div class="ai-choice-detail" data-reference-options hidden>
    <input type="file" data-references accept="image/png,image/jpeg,image/webp" multiple hidden>
    <button type="button" class="ai-reference-drop" data-add-references><strong>Перетащите референсы сюда</strong><span>или выберите файлы · PNG, JPG, WebP · до 6</span></button>
    <div class="ai-reference-list" data-reference-list></div>
    <label class="ai-artwork"><input type="checkbox" data-artwork> Создать графический фон по референсу</label>
    <p class="control-hint">Фон — отдельная генерация. Ваш интерфейс сохранится внутри телефона.</p>
   </div>
  </section>
 </div>
 <p class="ai-run-note" data-consent></p><p class="ai-form-status" role="status" data-status></p>`;
 const $=s=>panel.querySelector(s),copy=$('[data-copy]'),reference=$('[data-reference]'),artwork=$('[data-artwork]'),language=$('select'),status=$('[data-status]'),drop=$('[data-add-references]'),fileInput=$('[data-references]');
 status.tabIndex=-1;
 let refs=[],reading=false,controller=null,epoch=0;
 const progress=document.createElement('dialog');progress.className='ai-generation-screen';
 progress.setAttribute('aria-labelledby','ai-generation-title');
 progress.innerHTML='<div class="ai-generation-content"><div class="ai-spinner" aria-hidden="true"></div><p class="eyebrow">СОБИРАЕМ ВАШ КОМПЛЕКТ</p><h1 id="ai-generation-title">Готовим ваши экраны</h1><p class="ai-generation-stage" role="status" aria-live="polite"></p><p class="control-hint">Результат откроется в редакторе. Там можно изменить текст и оформление.</p><button type="button" class="button" data-cancel>Отменить</button><small>Отмена остановит ожидание. Уже отправленный запрос может быть оплачен.</small></div>';
 document.body.append(progress);
 function options(){const enabled=ai.hasKey();return {copy:enabled&&copy.checked,reference:enabled&&reference.checked,artwork:enabled&&reference.checked&&artwork.checked,locale:language.value,references:refs.map(r=>r.data)};}
 function refresh(){
  const enabled=ai.hasKey(),o=options();copy.disabled=reference.disabled=!enabled;
  $('[data-copy-options]').hidden=!copy.checked;language.disabled=!enabled;
  $('[data-reference-options]').hidden=!reference.checked;artwork.disabled=!enabled;
  drop.disabled=!enabled||reading||refs.length>=6;fileInput.disabled=drop.disabled;
  panel.dataset.connected=String(enabled);
  $('[data-consent]').textContent=!enabled?'Добавьте свой ключ, чтобы включить AI, или нажмите «Далее» и оформите комплект вручную.':!o.copy&&!o.reference?'Нажмите «Далее», чтобы перейти к ручному редактированию.':`По кнопке «Далее» в OpenAI отправятся ваши экраны${o.reference?' и референсы':''}. ${o.artwork?'Два платных запроса':'Один платный запрос'} через ваш API-аккаунт. Результат можно исправить или отменить в редакторе.`;
  onChange?.({disabled:reading||(o.reference&&!refs.length),active:o.copy||o.reference,summary:[o.copy?'Тексты по содержимому':'',o.reference?'Оформление по референсу':'',o.artwork?'Графический фон':''].filter(Boolean).join(' · ')||'Ручное оформление',cost:o.copy||o.reference?`${o.artwork?'2 платных запроса':'1 платный запрос'} в OpenAI по кнопке «Далее». Через ваш API-аккаунт.`:'Без AI-запросов и расходов.'});
 }
 function reset(){epoch++;controller?.abort();refs=[];copy.checked=reference.checked=artwork.checked=false;language.value='en';status.textContent='';refreshRefs();}
 function refreshRefs(){
  const list=$('[data-reference-list]');list.replaceChildren();
  refs.forEach((r,i)=>{const card=document.createElement('div'),img=document.createElement('img'),remove=document.createElement('button');card.className='ai-reference-thumb';img.src=r.data;img.alt='Референс '+(i+1);remove.type='button';remove.textContent='×';remove.className='icon-button';remove.setAttribute('aria-label','Удалить референс '+(i+1));remove.onclick=()=>{refs.splice(i,1);refreshRefs();};card.append(img,remove);list.append(card);});refresh();
 }
 async function addFiles(files){
  if(reading||!ai.hasKey()||!reference.checked||!files.length)return;
  if(refs.length+files.length>6){status.textContent='Можно добавить не больше 6 референсов.';return;}
  const session=epoch;reading=true;status.textContent='Загружаем референсы…';refresh();
  try{const added=[];for(const file of files){const media=await readScreenshot(file);if(session!==epoch)return;
   const ratio=Math.min(1,1400/media.height,800/media.width),canvas=document.createElement('canvas');canvas.width=Math.round(media.width*ratio);canvas.height=Math.round(media.height*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(media.image,0,0,canvas.width,canvas.height);added.push({data:canvas.toDataURL('image/jpeg',.9)});
  }refs.push(...added);status.textContent='';refreshRefs();}catch(e){if(session===epoch)status.textContent=e.message;}finally{reading=false;refresh();}
 }
 copy.onchange=reference.onchange=artwork.onchange=()=>{status.textContent='';refresh();};language.onchange=()=>status.textContent='';
 drop.onclick=()=>fileInput.click();fileInput.onchange=()=>{const files=[...fileInput.files];fileInput.value='';void addFiles(files);};
 // Reference uploads must never bubble into the app's screenshot uploader.
 panel.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();if(reference.checked&&ai.hasKey())drop.classList.add('dragover');});
 panel.addEventListener('dragleave',e=>{if(!panel.contains(e.relatedTarget))drop.classList.remove('dragover');});
 panel.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();drop.classList.remove('dragover');void addFiles([...e.dataTransfer.files]);});
 function cancel(){if(!controller)return;controller.abort();epoch++;controller=null;progress.close();onBusy(false);status.textContent='Сборка отменена. Настройки и референсы сохранены.';refresh();status.focus();}
 progress.querySelector('[data-cancel]').onclick=cancel;progress.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 async function run(){
  if(controller||reading)return;const o=options();
  if(!o.copy&&!o.reference){onContinue();return;}
  if(o.reference&&!refs.length){status.textContent='Добавьте хотя бы один референс.';return;}
  const expected=getRevision(),project=cloneProject(getProject()),current=new AbortController(),session=++epoch;controller=current;status.textContent='';onBusy(true);
  const heading=progress.querySelector('h1'),stage=progress.querySelector('[role=status]');heading.textContent='Готовим ваши экраны';stage.textContent='Это может занять несколько минут.';progress.showModal();
  const timer=setTimeout(()=>current.abort(),480000);
  const assertCurrent=()=>{if(epoch!==session||current.signal.aborted)throw new Error('Сборка отменена.');if(getRevision()!==expected)throw new Error('Комплект изменился. Запустите сборку заново.');};
  try{
   const next=await ai.buildPack({...o,project,signal:current.signal,assertCurrent,onProgress:id=>{assertCurrent();heading.textContent=stages[id];stage.textContent=id==='finish'?'Проверяем результат и сохраняем возможность отмены.':'Это может занять несколько минут.';}});
   assertCurrent();await onApply(next,expected,current.signal);
  }catch(e){if(epoch===session)status.textContent=current.signal.aborted?'Время ожидания истекло. Проект не изменён. Повторите вручную.':e.message;}
  finally{clearTimeout(timer);if(epoch===session){controller=null;progress.close();onBusy(false);refresh();if(status.textContent)status.focus();}}
 }
 function mount(host){if(!host)return;host.append(panel);ai.mountConnection($('[data-ai-connection-host]'));refresh();}
 return {mount,refresh,run,reset};
}
