import {requestBackground,BACKGROUND_MODEL} from './ai-background.js';
import {loadImage} from './media.js';
import {cloneProject,validateProject} from './model.js';
import {renderSlide} from './render.js';
import {screenFor} from './screen-assets.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function createBackgroundDialog({getProject,getRevision,getKey,getImage,onApply}){
 const modal=node('dialog');modal.className='ai-dialog background-dialog';document.body.append(modal);
 let controller=null,epoch=0;
 function close(){epoch++;controller?.abort();controller=null;modal.close();modal.replaceChildren();}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function open({prompt:initial='',quality='high'}={}){
  if(modal.open||!getKey())return;
  const snapshot=cloneProject(getProject()),revision=getRevision(),session=++epoch;
  let proposal=null;
  const heading=node('div');heading.className='dialog-heading';const dismiss=node('button','×');dismiss.setAttribute('aria-label','Закрыть генерацию фона');dismiss.onclick=close;heading.append(node('h2','Фон по описанию'),dismiss);
  const label=node('label','Какой фон нужен?'),prompt=node('textarea');prompt.value=initial;prompt.maxLength=3000;prompt.rows=3;prompt.setAttribute('aria-label','Описание фона');label.append(prompt);
  const qualityLabel=node('label','Качество'),select=node('select');select.setAttribute('aria-label','Качество фона');for(const [value,title] of [['high','Высокое'],['xhigh','Максимум деталей']]){const o=node('option',title);o.value=value;o.selected=value===quality;select.append(o);}qualityLabel.append(select);
  const consent=node('p','Один платный запрос в OpenAI ('+BACKGROUND_MODEL+'). Отправится только описание фона. Сначала вы увидите результат.');consent.className='ai-consent';
  const run=node('button','Сгенерировать фон'),apply=node('button','Применить ко всему комплекту');run.className=apply.className='button primary';apply.hidden=true;
  const status=node('p'),preview=node('div');status.setAttribute('role','status');preview.className='reference-preview-row';
  const invalidate=()=>{proposal=null;apply.hidden=true;preview.replaceChildren();};prompt.oninput=()=>{invalidate();run.disabled=!prompt.value.trim();};select.onchange=invalidate;run.disabled=!prompt.value.trim();
  run.onclick=async()=>{
   if(controller)return;invalidate();controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),300000);run.disabled=true;prompt.disabled=select.disabled=true;status.textContent='Создаём фон… Закройте окно для отмены.';
   try{
    const data=await requestBackground({key:getKey(),prompt:prompt.value,quality:select.value,signal:current.signal});
    if(epoch!==session||controller!==current||current.signal.aborted)return;
    const image=await loadImage(data);if(epoch!==session||controller!==current||current.signal.aborted)return;
    const asset={image:data,width:image.naturalWidth,height:image.naturalHeight};
    proposal=validateProject({...snapshot,background:{...snapshot.background,mode:'image',asset}});
    for(const [i,s] of proposal.slides.entries()){const canvas=node('canvas');canvas.setAttribute('aria-label','Фон на слайде '+(i+1));preview.append(canvas);renderSlide(canvas,proposal,s,getImage(screenFor(s,proposal.locale).image),i,{scale:.22,backgroundImage:image});}
    apply.hidden=false;status.textContent='Проверьте читаемость текста. Цвет можно изменить в редакторе.';
   }catch(e){if(epoch===session){proposal=null;apply.hidden=true;status.textContent=e.message;}}
   finally{clearTimeout(timer);if(controller===current){controller=null;run.disabled=false;prompt.disabled=select.disabled=false;}}
  };
  apply.onclick=async()=>{try{if(!proposal)return;if(getRevision()!==revision)throw new Error('Комплект изменился. Сгенерируйте фон заново.');await onApply(proposal,revision);close();}catch(e){status.textContent=e.message;}};
  modal.replaceChildren(heading,label,qualityLabel,consent,run,status,preview,apply);modal.showModal();
 }
 return {open,isOpen:()=>modal.open};
}
