import {LOCALES,cloneProject,switchLocale} from './model.js';
import {screenFor} from './screen-assets.js';
import {localizationPlan,requestLocalization,withLocalization} from './ai-localization.js';
import {COPY_MODEL} from './ai-copy.js';
import {IMAGE_MODEL} from './ai-images.js';
import {mountCopyPreview} from './copy-preview.js';
import {loadImage} from './media.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createLocalizationDialog({getProject,getRevision,getImage,getKey,onApply}){
 const modal=document.createElement('dialog');modal.className='ai-dialog localization-dialog';document.body.append(modal);
 let controller=null,disposePreview=null,applying=false;
 function close(){if(applying)return;controller?.abort();controller=null;disposePreview?.();disposePreview=null;modal.close();modal.replaceChildren();}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function open({locales=[],sourceLocale}={}){
  if(modal.open)return;
  const snapshot=cloneProject(getProject());if(sourceLocale)switchLocale(snapshot,sourceLocale);
  const revision=getRevision(),localImages=new Map();let result=null,activeLocale=null;
  modal.innerHTML=`<div class="dialog-heading"><h2>Локализация</h2><button class="icon-button" data-close aria-label="Закрыть локализацию">×</button></div><p>Основа: <strong>${LOCALES[snapshot.locale]}</strong>. Готовые версии появятся в редакторе.</p><fieldset data-options><legend>На какие языки</legend><div class="ai-language-grid">${Object.entries(LOCALES).filter(([l])=>l!=='source'&&l!==snapshot.locale).map(([l,name])=>`<label><input type="checkbox" data-language="${l}" ${locales.includes(l)?'checked':''}>${name}</label>`).join('')}</div><h3 class="scope-label">Что переводить</h3><label class="ai-scope"><input type="checkbox" data-texts checked><span><strong>Заголовки и подзаголовки</strong><small>Адаптация финальных маркетинговых текстов</small></span></label><label class="ai-scope"><input type="checkbox" data-interfaces><span><strong>Текст внутри интерфейса</strong><small>AI отредактирует загруженные картинки. Оригиналы сохранятся.</small></span></label><label class="image-quality" data-quality-wrap hidden>Качество интерфейса<select data-quality><option value="high">Высокое</option><option value="xhigh">Повышенная детализация · дороже</option></select></label><p class="help" data-plan></p></fieldset><div class="ai-actions"><button class="button primary" data-run>Подготовить перевод</button></div><p role="status" data-status></p><div class="proposal-locales" data-tabs></div><div class="copy-preview-row" data-copy-preview></div><div class="interface-comparison" data-images></div><label class="review-confirmation" data-review-wrap hidden><input type="checkbox" data-reviewed>Я проверил текст и детали интерфейса</label><div class="ai-actions proposal-actions"><button class="button primary" data-apply hidden>Применить и открыть язык</button><button class="button" data-close>Закрыть</button></div>`;
  const q=s=>modal.querySelector(s),run=q('[data-run]'),apply=q('[data-apply]'),status=q('[data-status]');
  const choices=()=>({locales:[...modal.querySelectorAll('[data-language]:checked')].map(e=>e.dataset.language),texts:q('[data-texts]').checked,interfaces:q('[data-interfaces]').checked,quality:q('[data-quality]').value});
  const clear=()=>{result=null;disposePreview?.();disposePreview=null;apply.hidden=true;q('[data-review-wrap]').hidden=true;q('[data-reviewed]').checked=false;for(const name of ['tabs','copy-preview','images'])q(`[data-${name}]`).replaceChildren();};
  function updatePlan(){
   clear();q('[data-quality-wrap]').hidden=!q('[data-interfaces]').checked;
   try{const plan=localizationPlan(snapshot,choices());run.disabled=false;q('[data-plan]').textContent=`В OpenAI отправятся ${plan.textRequests?'финальные тексты':''}${plan.textRequests&&plan.imageRequests?' и ':''}${plan.imageRequests?'загруженные интерфейсы':''}. Платных запросов: ${plan.textRequests+plan.imageRequests} (${plan.textRequests} текстовых, ${plan.imageRequests} изображений). ${plan.imageRequests?'Модель может изменить мелкие детали; перед применением сравните результат с оригиналом.':''}`;status.textContent='';}
   catch(e){run.disabled=true;q('[data-plan]').textContent=e.message;}
  }
  function updateApply(){const selected=result?.screens.some(r=>r.selected!==false);apply.disabled=applying||(!result?.entries.length&&!selected)||(selected&&!q('[data-reviewed]').checked);}
  function preview(){
   disposePreview?.();disposePreview=null;q('[data-copy-preview]').replaceChildren();
   const langs=[...new Set([...result.entries.map(([l])=>l),...result.screens.map(r=>r.locale)])];
   q('[data-tabs]').innerHTML=langs.map(l=>`<button class="button small" data-result-language="${l}" aria-pressed="${l===activeLocale}">${LOCALES[l]}</button>`).join('');
   for(const b of modal.querySelectorAll('[data-result-language]'))b.onclick=()=>{activeLocale=b.dataset.resultLanguage;preview();};
   const copy=result.entries.find(([l])=>l===activeLocale);
   if(copy){const draft=withLocalization(snapshot,result,{activate:snapshot.locale});disposePreview=mountCopyPreview(q('[data-copy-preview]'),draft,activeLocale,copy[1],source=>localImages.get(source)||getImage(source));}
   const rows=result.screens.filter(r=>r.locale===activeLocale);
   q('[data-images]').innerHTML=rows.length?`<h3>Сравните интерфейсы</h3><p class="help">Нажмите на картинку, чтобы рассмотреть её крупнее. Снимите галочку, если хотите оставить прежний экран.</p>${rows.map(row=>{const index=snapshot.slides.findIndex(s=>s.id===row.id),original=screenFor(snapshot.slides[index],snapshot.locale);return `<article class="interface-review"><label><input type="checkbox" data-use-image="${esc(row.id)}" ${row.selected!==false?'checked':''}>Применить интерфейс · слайд ${index+1}</label><div class="image-compare-pair"><button data-zoom-image aria-label="Увеличить исходный интерфейс ${index+1}"><span>${LOCALES[snapshot.locale]}</span><img src="${original.image}" alt="Исходный интерфейс ${index+1}"></button><button data-zoom-image aria-label="Увеличить перевод интерфейса ${index+1}"><span>${LOCALES[row.locale]}</span><img src="${row.asset.image}" alt="Перевод интерфейса ${index+1}"></button></div></article>`;}).join('')}`:'';
   for(const el of modal.querySelectorAll('[data-use-image]'))el.onchange=()=>{rows.find(r=>r.id===el.dataset.useImage).selected=el.checked;q('[data-reviewed]').checked=false;preview();};
   for(const el of modal.querySelectorAll('[data-zoom-image]'))el.onclick=()=>el.closest('.image-compare-pair').classList.toggle('zoomed');
   q('[data-review-wrap]').hidden=!result.screens.length;apply.hidden=false;updateApply();
  }
  q('[data-options]').onchange=updatePlan;q('[data-reviewed]').onchange=updateApply;
  for(const b of modal.querySelectorAll('[data-close]'))b.onclick=close;
  async function prepareImage(slide){
   const image=getImage(slide.image);if(!image)throw new Error('Не удалось подготовить исходный экран.');
   const ratio=Math.min(1,2048/slide.height),canvas=document.createElement('canvas');canvas.width=Math.round(slide.width*ratio);canvas.height=Math.round(slide.height*ratio);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   return {...slide,image:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height};
  }
  async function decodeImage(source,original){
   const image=await loadImage(source),ratio=image.naturalWidth/image.naturalHeight,expected=original.width/original.height;
   if(image.naturalWidth*image.naturalHeight>8294400||Math.abs(ratio/expected-1)>.035)throw new Error('Модель изменила пропорции экрана. Результат не применён.');
   const canvas=document.createElement('canvas');canvas.width=original.width;canvas.height=original.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const normalized=canvas.toDataURL('image/png');localImages.set(normalized,await loadImage(normalized));return {image:normalized,width:original.width,height:original.height,name:original.name,screenFit:original.screenFit,screenScale:original.screenScale,screenX:original.screenX,screenY:original.screenY};
  }
  run.onclick=async()=>{
   if(controller)return;const options=choices();let plan;try{plan={...localizationPlan(snapshot,options),quality:options.quality};}catch(e){status.textContent=e.message;return;}
   clear();controller=new AbortController();const current=controller;
   const timer=setTimeout(()=>current.abort(),Math.max(90000,(plan.textRequests*90+plan.imageRequests*180)*1000));
   q('[data-options]').disabled=true;run.disabled=true;
   try{const proposal=await requestLocalization({project:snapshot,plan,key:getKey(),signal:current.signal,prepareImage,decodeImage,onProgress:(i,n,label)=>{status.textContent=`${i} из ${n} · ${label}… Можно закрыть окно, чтобы отменить оставшиеся запросы.`;}});
    if(!modal.open||current.signal.aborted||controller!==current)return;
    result=proposal;activeLocale=plan.locales[0];preview();status.textContent='Проверьте результат перед применением. Тексты над телефонами можно отредактировать прямо на кадрах.';
   }catch(e){if(modal.open&&controller===current){clear();status.textContent=e.message;}}finally{clearTimeout(timer);if(controller===current){controller=null;run.disabled=false;q('[data-options]').disabled=false;}}
  };
  apply.onclick=async()=>{
   if(applying||apply.disabled||!result)return;
   try{if(getRevision()!==revision)throw new Error('Комплект изменился. Подготовьте перевод заново.');
    const next=withLocalization(snapshot,result,{activate:activeLocale});applying=true;apply.disabled=true;const locales=[...new Set([...result.entries.map(([l])=>l),...result.screens.filter(r=>r.selected!==false).map(r=>r.locale)])];await onApply(next,revision,locales);applying=false;close();
   }catch(e){applying=false;status.textContent=e.message;updateApply();}
  };
  const details=document.createElement('p');details.className='help ai-model-details';details.textContent=`Модели: ${COPY_MODEL} для текстов, ${IMAGE_MODEL} для интерфейса. Оплата через ваш API-аккаунт.`;q('[data-options]').append(details);
  updatePlan();modal.showModal();
 }
 return {open,isOpen:()=>modal.open};
}
