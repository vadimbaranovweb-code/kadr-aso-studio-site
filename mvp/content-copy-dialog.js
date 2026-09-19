import {requestCopy,applyGeneratedCopy} from './content-copy.js';
import {cloneProject} from './model.js';
import {screenFor} from './screen-assets.js';
let sessionKey='';
export function openContentCopy({project,images,getRevision,onApply}){
 const revision=getRevision(),snapshot=cloneProject(project),dialog=document.createElement('dialog');
 dialog.className='copy-dialog content-copy-dialog';dialog.setAttribute('aria-labelledby','copy-heading');
 dialog.innerHTML=`<h2 id="copy-heading">Тексты по вашим экранам</h2><p>AI посмотрит интерфейс и предложит короткие заголовки и подзаголовки. Сначала вы увидите результат, затем сможете применить его.</p><form><label>Язык текста<select name="locale"><option value="ru">Русский</option><option value="en">English</option></select></label><label>Ваш OpenAI API-ключ<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" required></label><p>Запрос платный, через ваш API-аккаунт. В OpenAI отправятся уменьшенные копии ${snapshot.slides.length} экранов. Ключ остаётся только в памяти вкладки.</p><button type="button" class="button quiet" data-forget>Забыть ключ</button><p role="status" data-copy-status></p><button type="submit" class="button primary">Сгенерировать тексты</button></form><div data-copy-preview hidden></div><div class="dialog-actions"><button class="button" data-close>Закрыть</button><button class="button primary" data-apply hidden>Применить к комплекту</button></div>`;
 const estimate=document.createElement('p');estimate.className='copy-estimate';estimate.textContent='Ориентир: $0.005–0.01 за 5 экранов. Точная сумма зависит от изображений и ответа.';dialog.querySelector('form label:last-of-type').after(estimate);
 document.body.append(dialog);const form=dialog.querySelector('form'),keyInput=form.elements.key,status=dialog.querySelector('[data-copy-status]'),preview=dialog.querySelector('[data-copy-preview]'),apply=dialog.querySelector('[data-apply]'),close=dialog.querySelector('[data-close]');
 keyInput.value=sessionKey;let controller=null,result=null,timer=null,closed=false;
 const finish=()=>{closed=true;controller?.abort();clearTimeout(timer);keyInput.value='';dialog.close();dialog.remove();};
 close.onclick=finish;dialog.oncancel=e=>{e.preventDefault();finish();};
 dialog.querySelector('[data-forget]').onclick=()=>{sessionKey='';keyInput.value='';keyInput.focus();};
 form.onsubmit=async event=>{
  event.preventDefault();if(controller)return;
  sessionKey=keyInput.value.trim();if(!sessionKey)return;
  result=null;preview.replaceChildren();preview.hidden=true;apply.hidden=true;status.className='';status.textContent='Изучаем экраны и пишем тексты…';
  controller=new AbortController();const signal=controller.signal;timer=setTimeout(()=>controller?.abort(),90000);
  for(const field of form.elements)field.disabled=true;close.textContent='Отменить';
  try{
   const slides=snapshot.slides.map(slide=>{const source=screenFor(slide,snapshot.locale),img=images.get(source.image);if(!img)throw new Error('Экран ещё не загрузился. Закройте окно и попробуйте снова.');const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(source.width,source.height));canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return {...slide,image:canvas.toDataURL('image/jpeg',.88)};});
   const rows=await requestCopy({key:sessionKey,slides,locale:form.elements.locale.value,signal});if(closed||signal.aborted)return;
   result=rows;rows.forEach((row,i)=>{const article=document.createElement('div');article.className='copy-row';const label=document.createElement('small'),title=document.createElement('h3'),subtitle=document.createElement('p');label.textContent=`Слайд ${i+1}`;title.textContent=row.title;subtitle.textContent=row.subtitle;article.append(label,title,subtitle);preview.append(article);});preview.hidden=false;apply.hidden=false;status.textContent='Готово. Проверьте смысл перед применением.';
  }catch(error){if(!closed){status.className='copy-error';status.textContent=error.message;}}
  finally{clearTimeout(timer);controller=null;if(!closed){for(const field of form.elements)field.disabled=false;close.textContent='Закрыть';}}
 };
 apply.onclick=()=>{if(!result||controller)return;if(getRevision()!==revision){status.className='copy-error';status.textContent='Комплект изменился. Закройте окно и сформируйте тексты заново.';apply.hidden=true;return;}const next=applyGeneratedCopy(snapshot,result);finish();onApply(next);};
 dialog.showModal();
}
