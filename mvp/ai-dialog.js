import {generateOnboardingPack} from './ai-onboarding-run.js';
import {loadImage} from './media.js';
import {createBackgroundDialog} from './background-dialog.js';
import {createReferenceDialog} from './reference-dialog.js';
import {LOCALES,cloneProject} from './model.js';
import {requestCopy,validateCopyResult,COPY_MODEL} from './ai-copy.js';
import {mountCopyPreview} from './copy-preview.js';
import {createLocalizationDialog} from './localization-dialog.js';
import {screenFor} from './screen-assets.js';
// A single session-only connection serves copy and interface localization.
export function createAIDialog({getProject,getRevision,getImage,onApply,onLocalize,onReference,onBackground,onKeyChange}){
 let apiKey='',controller=null,disposePreview=null;
 const modal=document.createElement('dialog');modal.className='ai-dialog';document.body.append(modal);
 const localization=createLocalizationDialog({getProject,getRevision,getImage,getKey:()=>apiKey,onApply:onLocalize});
 const background=createBackgroundDialog({getProject,getRevision,getImage,getKey:()=>apiKey,onApply:onBackground});
 const reference=createReferenceDialog({getProject,getRevision,getImage,getKey:()=>apiKey,onApply:onReference});
 function close(){controller?.abort();controller=null;disposePreview?.();disposePreview=null;modal.close();modal.replaceChildren();}
 function bindClose(){for(const b of modal.querySelectorAll('[data-close]'))b.onclick=close;}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function mountConnection(host){
  if(!host)return;
  host.innerHTML=`<div class="ai-key-heading"><strong>Подключение AI</strong><span data-key-status role="status"></span></div><form class="inline-ai-key"><label class="sr-only" for="onboarding-key">OpenAI API key</label><div class="ai-key-row"><input id="onboarding-key" type="password" aria-label="OpenAI API key" autocomplete="off" spellcheck="false" placeholder="sk-…"><button type="submit" class="button" disabled>Подключить</button><button type="button" class="button quiet" data-remove-key>Отключить</button></div></form><p class="control-hint">Ключ хранится в этой вкладке до перезагрузки. Подключение не запускает генерацию.</p>`;
  const input=host.querySelector('input'),save=host.querySelector('[type=submit]'),remove=host.querySelector('[data-remove-key]');
  function refresh(){
   input.value='';input.placeholder=apiKey?'Ключ добавлен · новый ключ для замены':'sk-…';
   save.textContent=apiKey?'Заменить':'Подключить';save.disabled=true;
   remove.disabled=!apiKey;host.querySelector('[data-key-status]').textContent=apiKey?'Готово к работе':'Не подключено';
   host.dataset.connected=String(Boolean(apiKey));
  }
  input.oninput=()=>save.disabled=!input.value.trim();
  host.querySelector('form').onsubmit=e=>{e.preventDefault();if(!input.value.trim())return;apiKey=input.value.trim();refresh();onKeyChange();input.focus({preventScroll:true});};
  remove.onclick=()=>{apiKey='';refresh();onKeyChange();input.focus({preventScroll:true});};refresh();
 }
 async function buildPack(options){
  return generateOnboardingPack({...options,key:apiKey},{
   prepareSlides:snapshot=>snapshot.slides.map(s=>{
    const asset=screenFor(s,snapshot.locale),image=getImage(asset.image);if(!image)throw new Error('Не удалось подготовить экран.');
    const ratio=Math.min(1,1400/asset.height,700/asset.width),canvas=document.createElement('canvas');canvas.width=Math.round(asset.width*ratio);canvas.height=Math.round(asset.height*ratio);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return {...s,image:canvas.toDataURL('image/jpeg',.88)};
   }),
   decodeBackground:async data=>{const image=await loadImage(data);return {image:data,width:image.naturalWidth,height:image.naturalHeight};}
  });
 }
 function connect(){
  if(modal.open||localization.isOpen()||reference.isOpen()||background.isOpen())return;
  modal.className='ai-dialog key-dialog';
  modal.innerHTML=`<div class="dialog-heading"><h2>Настройки AI</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></div><p>Один ключ для генерации текстов и локализации комплекта.</p><label>OpenAI API key<input type="password" data-key autocomplete="off" spellcheck="false" placeholder="${apiKey?'Заменить текущий ключ':'sk-…'}"></label><p class="help">Ключ остаётся только в памяти вкладки до перезагрузки. Запросы оплачиваются отдельно через ваш API-аккаунт; подписка ChatGPT их не покрывает. Подключение ключа само по себе не отправляет запрос.</p><div class="ai-actions"><button class="button primary" data-save-key disabled>${apiKey?'Заменить ключ':'Подключить'}</button>${apiKey?'<button class="button" data-forget>Удалить ключ</button>':''}<button class="button quiet" data-close>Закрыть</button></div>`;
  const input=modal.querySelector('[data-key]'),save=modal.querySelector('[data-save-key]');
  input.oninput=()=>save.disabled=!input.value.trim();save.onclick=()=>{apiKey=input.value.trim();close();onKeyChange();};
  const forget=modal.querySelector('[data-forget]');if(forget)forget.onclick=()=>{apiKey='';close();onKeyChange();};bindClose();modal.showModal();
 }
 function open(options={}){
  if(modal.open||localization.isOpen()||reference.isOpen()||background.isOpen())return;if(!apiKey)return connect();
  if(options.mode==='background')return background.open(options);
  if(options.mode==='reference')return reference.open();
  if(options.mode==='localize')return localization.open(options);
  const snapshot=cloneProject(getProject()),revision=getRevision();let rows=null,target=snapshot.locale==='source'?'en':snapshot.locale;
  modal.className='ai-dialog copy-dialog';
  modal.innerHTML=`<div class="dialog-heading"><h2>Тексты по содержимому экранов</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></div><label class="generation-language">Язык текста<select data-language>${Object.entries(LOCALES).filter(([l])=>l!=='source').map(([l,name])=>`<option value="${l}" ${l===target?'selected':''}>${name}</option>`).join('')}</select></label><p class="ai-consent">В OpenAI отправятся изображения интерфейса: ${snapshot.slides.length}. Запрос оплачивается через ваш API-аккаунт (${COPY_MODEL}).</p><div class="ai-actions"><button class="button primary" data-generate ${!snapshot.slides.length?'disabled':''}>Сгенерировать тексты</button></div><p data-status role="status"></p><div class="copy-preview-row" data-copy-preview></div><div class="ai-actions proposal-actions"><button class="button primary" data-apply hidden>Применить</button><button class="button" data-close>Закрыть</button></div>`;
  const status=modal.querySelector('[data-status]'),generate=modal.querySelector('[data-generate]'),apply=modal.querySelector('[data-apply]'),language=modal.querySelector('[data-language]');
  const invalidate=()=>{rows=null;apply.hidden=true;disposePreview?.();disposePreview=null;modal.querySelector('[data-copy-preview]').replaceChildren();};
  language.onchange=invalidate;bindClose();
  generate.onclick=async()=>{
   if(controller)return;invalidate();controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),90000);generate.disabled=true;language.disabled=true;status.textContent='Готовим тексты… Закройте окно, чтобы отменить ожидание.';
   try{
    target=language.value;const slides=snapshot.slides.map(s=>{const asset=screenFor(s,snapshot.locale),image=getImage(asset.image);if(!image)throw new Error('Не удалось подготовить экран.');const ratio=Math.min(1,1400/asset.height,700/asset.width),canvas=document.createElement('canvas');canvas.width=Math.round(asset.width*ratio);canvas.height=Math.round(asset.height*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return {...s,image:canvas.toDataURL('image/jpeg',.88)};});
    const proposed=await requestCopy({key:apiKey,slides,locale:target,mode:'generate',signal:current.signal});
    if(!modal.open||controller!==current||current.signal.aborted)return;
    rows=proposed;disposePreview=mountCopyPreview(modal.querySelector('[data-copy-preview]'),snapshot,snapshot.locale==='source'?'source':target,rows,getImage);apply.hidden=false;status.textContent='Проверьте результат. Текст можно поправить прямо на кадрах до применения.';
   }catch(e){if(modal.open&&controller===current){rows=null;status.textContent=e.message;}}finally{clearTimeout(timer);if(controller===current){controller=null;generate.disabled=false;language.disabled=false;}}
  };
  apply.onclick=()=>{try{if(!rows)return;validateCopyResult({slides:rows},snapshot.slides);if(getRevision()!==revision)throw new Error('Комплект изменился. Запустите генерацию заново.');const locale=snapshot.locale==='source'?'source':target;onApply([[locale,rows]],{activate:locale});close();}catch(e){status.textContent=e.message;}};
  modal.showModal();
 }
 return {connect,open,mountConnection,buildPack,hasKey:()=>Boolean(apiKey)};
}
