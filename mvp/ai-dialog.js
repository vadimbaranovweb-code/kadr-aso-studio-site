import {LOCALES,cloneProject,hasExamples,switchLocale} from './model.js';
import {requestCopy,requestCopyBatch,validateCopyResult,COPY_MODEL} from './ai-copy.js';
import {mountCopyPreview} from './copy-preview.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Session-only key. Connecting never makes a paid request.
export function createAIDialog({getProject,getRevision,getImage,onApply,onKeyChange}){
 let apiKey='',controller=null,disposePreview=null;
 const modal=document.createElement('dialog');modal.className='ai-dialog';document.body.append(modal);
 function close(){controller?.abort();controller=null;disposePreview?.();disposePreview=null;modal.close();modal.replaceChildren();}
 function bindClose(){for(const b of modal.querySelectorAll('[data-close]'))b.onclick=close;}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function connect(){
  if(modal.open)return;
  modal.className='ai-dialog key-dialog';
  modal.innerHTML=`<div class="dialog-heading"><h2>Подключить GPT</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></div><p>Генерируйте заголовки по экранам и переводите готовый комплект.</p><label>OpenAI API key<input type="password" data-key autocomplete="off" spellcheck="false" placeholder="${apiKey?'Заменить текущий ключ':'sk-…'}"></label><p class="help">Ключ остаётся только в памяти вкладки до перезагрузки. Запросы оплачиваются отдельно через ваш API-аккаунт; подписка ChatGPT их не покрывает. Подключение ключа само по себе не отправляет запрос.</p><div class="ai-actions"><button class="button primary" data-save-key disabled>Добавить ключ</button>${apiKey?'<button class="button" data-forget>Удалить ключ</button>':''}<button class="button quiet" data-close>Позже</button></div>`;
  const input=modal.querySelector('[data-key]'),save=modal.querySelector('[data-save-key]');
  input.oninput=()=>save.disabled=!input.value.trim();save.onclick=()=>{apiKey=input.value.trim();close();onKeyChange();};
  const forget=modal.querySelector('[data-forget]');if(forget)forget.onclick=()=>{apiKey='';close();onKeyChange();};bindClose();modal.showModal();
 }
 function open({mode='generate',locales=[],sourceLocale}={}){
  if(modal.open)return;if(!apiKey)return connect();
  const snapshot=cloneProject(getProject());if(mode==='localize'&&sourceLocale)switchLocale(snapshot,sourceLocale);const revision=getRevision(),localize=mode==='localize',targets=[...new Set(locales)].filter(l=>l!=='source'&&l!==snapshot.locale&&Object.hasOwn(LOCALES,l));
  let entries=null,active=0,target=snapshot.locale==='source'?'en':snapshot.locale;
  modal.className='ai-dialog copy-dialog';
  modal.innerHTML=`<div class="dialog-heading"><h2>${localize?'Локализация готового комплекта':'Тексты по содержимому экранов'}</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></div>${localize?`<p>Из версии «${LOCALES[snapshot.locale]}» → ${targets.map(l=>LOCALES[l]).join(', ')}. Существующие переводы этих языков заменятся только после применения.</p>`:`<label class="generation-language">Язык текста<select data-language>${Object.entries(LOCALES).filter(([l])=>l!=='source').map(([l,name])=>`<option value="${l}" ${l===target?'selected':''}>${name}</option>`).join('')}</select></label>`}<p class="ai-consent">${localize?`В OpenAI отправятся финальные тексты. ${targets.length} запросов — по одному на язык. Изображения не отправляются и не переводятся.`:`В OpenAI отправятся ${snapshot.slides.length} скриншотов для определения функций приложения.`} Запросы платные через ваш API-аккаунт (${COPY_MODEL}).</p><div class="ai-actions"><button class="button primary" data-generate ${!snapshot.slides.length||(localize&&(!targets.length||hasExamples(snapshot)))?'disabled':''}>${localize?'Локализовать выбранные языки':'Сгенерировать тексты'}</button></div><p data-status role="status">${localize&&hasExamples(snapshot)?'Сначала замените тексты-примеры в редакторе.':''}</p><div class="proposal-locales" data-proposal-locales></div><div class="copy-preview-row" data-copy-preview></div><div class="ai-actions proposal-actions"><button class="button primary" data-apply hidden>Применить</button><button class="button" data-close>Закрыть</button></div>`;
  const status=modal.querySelector('[data-status]'),generate=modal.querySelector('[data-generate]'),apply=modal.querySelector('[data-apply]');
  const invalidate=()=>{entries=null;apply.hidden=true;disposePreview?.();disposePreview=null;modal.querySelector('[data-copy-preview]').replaceChildren();modal.querySelector('[data-proposal-locales]').replaceChildren();};
  const preview=()=>{disposePreview?.();const [locale,rows]=entries[active];const bar=modal.querySelector('[data-proposal-locales]');bar.innerHTML=entries.map(([l],i)=>`<button class="button small" data-proposal-index="${i}" aria-pressed="${i===active}">${LOCALES[l]}</button>`).join('');for(const b of bar.querySelectorAll('button'))b.onclick=()=>{active=+b.dataset.proposalIndex;preview();};disposePreview=mountCopyPreview(modal.querySelector('[data-copy-preview]'),snapshot,locale,rows,getImage);};
  modal.querySelector('[data-language]')?.addEventListener('change',invalidate);bindClose();
  generate.onclick=async()=>{
   if(controller)return;invalidate();controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),localize?Math.min(300000,90000*targets.length):90000);generate.disabled=true;const language=modal.querySelector('[data-language]');if(language)language.disabled=true;status.textContent='Готовим тексты… Закройте окно, чтобы отменить ожидание.';
   try{
    if(localize)entries=await requestCopyBatch({key:apiKey,slides:snapshot.slides,locales:targets,signal:current.signal,onProgress:(i,n,l)=>{status.textContent=`Перевод ${i+1} из ${n}: ${LOCALES[l]}…`;}});
    else{
     target=language.value;const slides=snapshot.slides.map(s=>{const image=getImage(s.image);if(!image)throw new Error('Не удалось подготовить экран.');const ratio=Math.min(1,1400/s.height,700/s.width),canvas=document.createElement('canvas');canvas.width=Math.round(s.width*ratio);canvas.height=Math.round(s.height*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return {...s,image:canvas.toDataURL('image/jpeg',.88)};});
     const rows=await requestCopy({key:apiKey,slides,locale:target,mode:'generate',signal:current.signal});entries=[[snapshot.locale==='source'?'source':target,rows]];
    }
    if(!modal.open||controller!==current||current.signal.aborted)return;
    active=0;preview();apply.hidden=false;status.textContent='Проверьте результат. Текст можно поправить прямо на кадрах до применения.';
   }catch(e){if(modal.open&&controller===current){entries=null;status.textContent=e.message;}}finally{clearTimeout(timer);if(controller===current){controller=null;generate.disabled=false;if(language)language.disabled=false;}}
  };
  apply.onclick=()=>{try{if(!entries)return;for(const [,rows] of entries)validateCopyResult({slides:rows},snapshot.slides);if(getRevision()!==revision)throw new Error('Комплект изменился. Запустите генерацию заново.');onApply(entries,{activate:localize?snapshot.locale:entries[0][0]});close();}catch(e){status.textContent=e.message;}};
  modal.showModal();
 }
 return {connect,open,hasKey:()=>Boolean(apiKey)};
}
