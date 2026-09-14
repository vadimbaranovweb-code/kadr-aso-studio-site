import {LOCALES,cloneProject} from './model.js';
import {requestCopy,validateCopyResult,COPY_MODEL} from './ai-copy.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Session-only BYOK. Never pass the key into project state, autosave, URLs or logs.
export function createAIDialog({getProject,getRevision,getImage,onApply,onKeyChange}){
 let apiKey='',controller=null;const modal=document.createElement('dialog');modal.className='ai-dialog';document.body.append(modal);
 function close(){controller?.abort();controller=null;modal.close();modal.replaceChildren();}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function open(){
  if(modal.open)return;const snapshot=cloneProject(getProject()),snapshotRevision=getRevision();let rows=null,target=snapshot.locale==='source'?'en':snapshot.locale;
  modal.innerHTML=`<div class="dialog-heading"><h2>Тексты и локализация</h2><button class="icon-button" data-close aria-label="Закрыть">×</button></div><label>Ваш OpenAI API key<input type="password" data-key autocomplete="off" spellcheck="false" placeholder="${apiKey?'Ключ добавлен на эту сессию':'sk-…'}"></label><p class="help">Ключ хранится только в памяти этой вкладки. После перезагрузки введите его снова.</p><div class="ai-options"><label>Действие<select data-mode><option value="generate">Написать по скриншотам</option><option value="localize">Адаптировать текущие тексты</option></select></label><label>Язык результата<select data-language>${Object.entries(LOCALES).filter(([k])=>k!=='source').map(([k,v])=>`<option value="${k}" ${k===target?'selected':''}>${v}</option>`).join('')}</select></label></div><p class="ai-consent">По кнопке «Сгенерировать» в OpenAI будут отправлены скриншоты (${snapshot.slides.length}) и тексты комплекта. Запрос платный через ваш API-аккаунт (${COPY_MODEL}); подписка ChatGPT его не оплачивает. Текст внутри изображений не переводится.</p><div class="ai-actions"><button class="button primary" data-generate ${!apiKey||!snapshot.slides.length?'disabled':''}>Сгенерировать</button><button class="button" data-forget ${apiKey?'':'disabled'}>Удалить ключ</button></div><p data-status role="status"></p><div data-results></div><div class="ai-actions"><button class="button primary" data-apply hidden>Применить тексты</button><button class="button" data-close>Закрыть</button></div>`;
  const keyInput=modal.querySelector('[data-key]'),generate=modal.querySelector('[data-generate]'),forget=modal.querySelector('[data-forget]'),status=modal.querySelector('[data-status]'),apply=modal.querySelector('[data-apply]');
  keyInput.oninput=()=>{apiKey=keyInput.value.trim();generate.disabled=!apiKey||!snapshot.slides.length;forget.disabled=!apiKey;onKeyChange();};
  forget.onclick=()=>{apiKey='';keyInput.value='';keyInput.placeholder='sk-…';generate.disabled=true;forget.disabled=true;onKeyChange();};
  for(const b of modal.querySelectorAll('[data-close]'))b.onclick=close;
  const invalidate=()=>{rows=null;apply.hidden=true;modal.querySelector('[data-results]').replaceChildren();status.textContent='';};
  modal.querySelector('[data-language]').onchange=invalidate;modal.querySelector('[data-mode]').onchange=invalidate;
  generate.onclick=async()=>{
   if(controller||!apiKey)return;invalidate();controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),90000);target=modal.querySelector('[data-language]').value;const mode=modal.querySelector('[data-mode]').value;
   for(const el of modal.querySelectorAll('input,select,[data-generate],[data-forget]'))el.disabled=true;status.textContent='Готовим тексты… Можно закрыть окно, чтобы отменить ожидание.';
   try{const slides=snapshot.slides.map(s=>{const image=getImage(s.image);if(!image)throw new Error('Не удалось подготовить экран.');const ratio=Math.min(1,1400/s.height,700/s.width),canvas=document.createElement('canvas');canvas.width=Math.round(s.width*ratio);canvas.height=Math.round(s.height*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return {...s,image:canvas.toDataURL('image/jpeg',.88)};});
    const result=await requestCopy({key:apiKey,slides,locale:target,mode,signal:current.signal});if(!modal.open||controller!==current||current.signal.aborted)return;rows=result;
    modal.querySelector('[data-results]').innerHTML=rows.map((r,i)=>`<fieldset><legend>Слайд ${i+1}</legend><label>Заголовок<textarea data-result="title" data-index="${i}" maxlength="90">${esc(r.title)}</textarea></label><label>Подзаголовок<textarea data-result="subtitle" data-index="${i}" maxlength="160">${esc(r.subtitle)}</textarea></label></fieldset>`).join('');
    status.textContent='Проверьте формулировки. После применения выберите этот язык над холстом; оригинал останется в списке.';apply.hidden=false;
   }catch(e){if(modal.open&&controller===current)status.textContent=e.message;}finally{clearTimeout(timer);if(controller===current){controller=null;for(const el of modal.querySelectorAll('input,select,[data-generate],[data-forget]'))el.disabled=false;generate.disabled=!apiKey;forget.disabled=!apiKey;}}
  };
  modal.oninput=e=>{if(rows&&e.target.hasAttribute('data-result'))rows[+e.target.dataset.index][e.target.dataset.result]=e.target.value;};
  apply.onclick=()=>{try{validateCopyResult({slides:rows},snapshot.slides);if(getRevision()!==snapshotRevision)throw new Error('Комплект изменился, откройте генерацию заново.');onApply(target,rows);close();}catch(e){status.textContent=e.message;}};
  modal.showModal();
 }
 return {open,hasKey:()=>Boolean(apiKey)};
}
