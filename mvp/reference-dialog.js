import {LOCALES,cloneProject,validateProject,copyOf} from './model.js';
import {screenFor} from './screen-assets.js';
import {readScreenshot} from './media.js';
import {renderSlide} from './render.js';
import {editMarks} from './text-marks.js';
import {requestReference,applyReference,REFERENCE_MODEL} from './ai-reference.js';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function createReferenceDialog({getProject,getRevision,getImage,getKey,onApply}){
 const modal=el('dialog',undefined,'ai-dialog reference-dialog');document.body.append(modal);
 let controller=null,epoch=0;
 function close(){epoch++;controller?.abort();controller=null;modal.close();modal.replaceChildren();}
 modal.addEventListener('cancel',e=>{e.preventDefault();close();});
 function open(){
  if(modal.open||!getKey())return;
  const snapshot=cloneProject(getProject()),revision=getRevision(),session=++epoch;
  let refs=[],draft=null,target=snapshot.locale==='source'?'en':snapshot.locale,keepCopy=false,phase=1,loading=false;
  function shell(title){
   modal.replaceChildren();const heading=el('div',undefined,'dialog-heading'),dismiss=el('button','×','icon-button');
   dismiss.setAttribute('aria-label','Закрыть сборку по референсу');dismiss.onclick=close;heading.append(el('h2',title),dismiss);
   modal.append(heading,el('p',phase+' / 3 · Референсы → Анализ → Предпросмотр','control-hint'));
  }
  function button(text,action,primary=false){const b=el('button',text,'button'+(primary?' primary':''));b.type='button';b.onclick=action;return b;}
  function upload(){
   phase=1;shell('Собрать по референсу');modal.append(el('p','Добавьте 1–6 вертикальных ASO-скриншотов. AI предложит расположение элементов, палитру, акценты и простую графику. Ваш интерфейс останется отдельным изображением.','help'));
   const grid=el('div',undefined,'reference-thumbnails'),input=el('input'),status=el('p',undefined,'help'),add=button('Добавить референсы',()=>input.click()),next=button('Далее',settings,true);
   input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;status.setAttribute('role','status');
   function refresh(){
    grid.replaceChildren();refs.forEach((r,i)=>{const card=el('div',undefined,'reference-thumb'),image=el('img');image.src=r.data;image.alt='Референс '+(i+1);const remove=button('Удалить '+(i+1),()=>{refs.splice(i,1);refresh();});card.append(image,remove);grid.append(card);});
    next.disabled=loading||!refs.length||!snapshot.slides.length;add.disabled=loading||refs.length>=6;
   }
   input.onchange=async()=>{
    const files=[...input.files];input.value='';if(loading||!files.length)return;
    if(refs.length+files.length>6){status.textContent='Можно добавить не больше 6 референсов.';return;}
    loading=true;refresh();status.textContent='Загружаем референсы…';
    try{const added=[];for(const file of files){const media=await readScreenshot(file);if(epoch!==session)return;added.push({data:prepare(media.image,media.width,media.height)});}refs.push(...added);status.textContent='Референсы готовы.';}
    catch(e){if(epoch===session)status.textContent=e.message;}
    finally{if(epoch===session){loading=false;refresh();}}
   };
   const actions=el('div',undefined,'ai-actions');actions.append(add,next);modal.append(input,grid,status,actions);if(!snapshot.slides.length)status.textContent='Сначала загрузите свои экраны в комплект.';refresh();
  }
  function prepare(image,width,height){const ratio=Math.min(1,1400/height,800/width),canvas=document.createElement('canvas');canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9);}
  function settings(){
   phase=2;shell('Анализ и сборка');const options=el('fieldset'),label=el('label','Язык заголовков'),language=el('select');
   language.setAttribute('aria-label','Язык заголовков по референсу');for(const [code,name] of Object.entries(LOCALES).filter(([l])=>l!=='source')){const option=el('option',name);option.value=code;option.selected=code===target;language.append(option);}language.onchange=()=>target=language.value;label.append(language);
   const keep=el('label',undefined,'reference-keep'),check=el('input');check.type='checkbox';check.checked=keepCopy;check.onchange=()=>keepCopy=check.checked;keep.append(check,el('span','Сохранить мои заголовки и подзаголовки'));
   const consent=el('p','В OpenAI отправятся '+refs.length+' референсов и '+snapshot.slides.length+' ваших экранов. Один платный запрос через ваш API-аккаунт ('+REFERENCE_MODEL+'). Результат появится для проверки перед применением.','ai-consent');
   options.append(label,keep);modal.append(options,consent);
   const status=el('p');status.setAttribute('role','status');const run=button('Собрать по референсу',generate,true),back=button('Назад к референсам',upload),actions=el('div',undefined,'ai-actions');actions.append(back,run);modal.append(actions,status);
   async function generate(){
    if(controller)return;controller=new AbortController();const current=controller,timer=setTimeout(()=>current.abort(),180000);run.disabled=true;back.disabled=true;options.disabled=true;status.textContent='Анализируем оформление и собираем кадры… Закройте окно, чтобы отменить.';
    try{
     const slides=snapshot.slides.map(s=>{const asset=screenFor(s,snapshot.locale),image=getImage(asset.image);if(!image)throw new Error('Не удалось подготовить ваш экран.');return {id:s.id,image:prepare(image,asset.width,asset.height)};});
     const plan=await requestReference({key:getKey(),slides,references:refs.map(r=>r.data),locale:target,subtitleEnabled:snapshot.subtitleEnabled,signal:current.signal});
     if(epoch!==session||controller!==current||current.signal.aborted)return;
     draft=applyReference(snapshot,plan);
     if(keepCopy)for(const [i,s] of draft.slides.entries()){Object.assign(s,copyOf(snapshot.slides[i]));s.copies[draft.locale]=copyOf(s);}
     preview(plan.summary);
    }catch(e){if(epoch===session)status.textContent=e.message;}
    finally{clearTimeout(timer);if(controller===current){controller=null;run.disabled=false;back.disabled=false;options.disabled=false;}}
   }
  }
  function preview(summary){
   phase=3;shell('Проверьте комплект');modal.append(el('p',summary,'help'));
   const row=el('div',undefined,'reference-preview-row'),status=el('p');status.setAttribute('role','status');
   const cards=draft.slides.map((s,i)=>{
    const card=el('div',undefined,'reference-preview-card'),canvas=el('canvas');canvas.setAttribute('aria-label','Композиция по референсу '+(i+1));card.append(canvas);
    const paint=()=>renderSlide(canvas,draft,s,getImage(screenFor(s,draft.locale).image),i,{scale:.24});
    for(const field of ['title',...(draft.subtitleEnabled?['subtitle']:[])]){
     const label=el('label',field==='title'?'Заголовок':'Подзаголовок'),input=el('textarea');input.maxLength=field==='title'?90:160;input.value=s[field];input.setAttribute('aria-label',(field==='title'?'Заголовок':'Подзаголовок')+' референсного кадра '+(i+1));
     input.oninput=()=>{s[field+'Marks']=editMarks(s[field+'Marks'],s[field],input.value);s[field]=input.value;s.copies[draft.locale]=copyOf(s);paint();};label.append(input);card.append(label);
    }
    row.append(card);return {paint};
   });
   const actions=el('div',undefined,'ai-actions proposal-actions'),apply=button('Применить и открыть редактор',async()=>{
    try{if(getRevision()!==revision)throw new Error('Комплект изменился. Соберите предложение заново.');const next=validateProject(draft);await onApply(next,revision);close();}catch(e){status.textContent=e.message;}
   },true);
   actions.append(button('Назад к настройкам',settings),apply);modal.append(row,el('p','В редакторе можно поправить текст на кадре, фон, положение телефона и графику. Применение можно отменить.','help'),status,actions);cards.forEach(c=>c.paint());
  }
  upload();modal.showModal();
 }
 return {open,isOpen:()=>modal.open};
}
