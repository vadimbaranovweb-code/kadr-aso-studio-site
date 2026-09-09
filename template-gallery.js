import {clone} from './model.js';
import {drawFrame} from './render.js';
import {SET_TEMPLATES,templateSlots,buildTemplateVariant} from './templates.js';

export function createTemplateGallery({getProject,getActive,images,onVariant,onFrame,notify}){
  const $=id=>document.getElementById(id),dialog=$('templates-dialog');
  let source=null,sources=[],chosen='utility',chosenSlot=0,job=0,ready=new Map(),rendering=false;
  function release(){for(const c of dialog.querySelectorAll('canvas'))c.width=c.height=1;}
  function selection(){
    const slots=templateSlots(chosen,sources.length);
    for(const card of dialog.querySelectorAll('[data-template]')){
      const yes=card.dataset.template===chosen;card.classList.toggle('selected',yes);
      card.querySelector('input').checked=yes;
      for(const b of card.querySelectorAll('[data-slot]'))b.setAttribute('aria-pressed',String(yes&&Number(b.dataset.slot)===chosenSlot));
    }
    for(const [i,el] of [...dialog.querySelectorAll('[data-slot-name]')].entries())el.textContent=slots[i].name;
    const candidate=ready.get(chosen),available=!rendering&&candidate&&!candidate.error;
    $('use-template-set').disabled=!available||candidate.renderErrors.some(Boolean);
    $('use-template-frame').disabled=!available||Boolean(candidate.renderErrors[chosenSlot]);
    $('use-template-set').textContent=`Создать вариант · ${sources.length} ${sources.length===1?'кадр':sources.length<5?'кадра':'кадров'}`;
    $('use-template-frame').textContent=`Кадр ${chosenSlot+1} → в текущий`;
    $('template-choice').textContent=`${SET_TEMPLATES.find(t=>t.id===chosen).name} · ${slots[chosenSlot].name}`;
  }
  function sourceControls(){
    const list=$('template-sources');list.replaceChildren();
    sources.forEach((value,index)=>{
      const label=document.createElement('label'),name=document.createElement('span');name.dataset.slotName=index;
      const count=document.createElement('strong');count.textContent=String(index+1).padStart(2,'0');
      const select=document.createElement('select');select.setAttribute('aria-label',`Исходный кадр для позиции ${index+1}`);
      source.frames.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}. ${f.demo?'Демонстрационный экран':f.sourceName}`;select.append(o);});
      select.value=value;select.onchange=()=>{sources[index]=Number(select.value);refresh();};
      label.append(count,name,select);list.append(label);
    });
  }
  async function refresh(){
    const token=++job;rendering=true;ready=new Map();release();const list=$('template-gallery');list.replaceChildren();
    $('template-progress').textContent='Готовим превью с твоими экранами…';
    for(const template of SET_TEMPLATES){
      const card=document.createElement('article');card.className='template-card';card.dataset.template=template.id;
      const heading=document.createElement('label');heading.className='template-card-heading';
      const radio=document.createElement('input');radio.type='radio';radio.name='set-template';radio.value=template.id;
      const text=document.createElement('span'),title=document.createElement('strong'),description=document.createElement('span');
      title.textContent=template.name;description.textContent=template.description;text.append(title,description);
      radio.onchange=()=>{chosen=template.id;selection();};heading.append(radio,text);card.append(heading);
      const strip=document.createElement('div');strip.className='template-strip';card.append(strip);
      const message=document.createElement('p');message.className='template-warning';message.hidden=true;card.append(message);list.append(card);
      let candidate;
      try{candidate={project:buildTemplateVariant(source,template.id,{sources,device:$('template-device').value,keepColors:$('template-colors').checked}),renderErrors:[]};}
      catch(error){candidate={error:error.message};message.textContent=error.message;message.hidden=false;}
      if(candidate.project)for(const [i,frame] of candidate.project.frames.entries()){
        const b=document.createElement('button');b.type='button';b.className='template-frame';b.dataset.slot=i;b.setAttribute('aria-label',`${template.name}, кадр ${i+1}: ${templateSlots(template.id,sources.length)[i].name}`);
        const c=document.createElement('canvas');c.setAttribute('aria-hidden','true');
        const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');b.append(c,n);strip.append(b);
        b.onclick=()=>{chosen=template.id;chosenSlot=i;selection();};
      }
      ready.set(template.id,candidate);
    }
    // Disable applying until all preview renders have completed. Closing the
    // dialog or changing inputs cancels the previous job between frames.
    selection();
    for(const template of SET_TEMPLATES){
      const card=list.querySelector(`[data-template="${template.id}"]`),candidate=ready.get(template.id);
      if(!candidate.project)continue;
      for(const [i,c] of [...card.querySelectorAll('canvas')].entries()){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        if(token!==job||!dialog.open)return;
        try{const result=drawFrame(c,candidate.project.frames[i],images,source.format,.27);candidate.renderErrors[i]=result.errors.length>0;}
        catch{candidate.renderErrors[i]=true;}
      }
      if(candidate.renderErrors.some(Boolean)){
        const warning=card.querySelector('.template-warning');warning.textContent='Не удалось отрисовать 3D. Выбери «Обычная рамка» или перезапусти 3D в редакторе.';warning.hidden=false;
      }
    }
    if(token!==job||!dialog.open)return;
    rendering=false;$('template-progress').textContent=`Превью в размере ${source.format.replace('x',' × ')}. Нажми на кадр, чтобы выбрать его отдельно.`;
    selection();
  }
  function open(){
    source=clone(getProject());sources=Array.from({length:source.frames.length===1&&source.frames[0].demo?6:source.frames.length},(_,i)=>i%source.frames.length);
    chosenSlot=0;$('template-count').value=sources.length;
    $('template-current-frame').textContent=`Сейчас в редакторе: кадр ${getActive()+1}.`;
    const count=source.frames.reduce((n,f)=>n+f.layers.filter(l=>l.locked).length,0);
    $('template-locks').hidden=!count;$('template-locks').textContent='В исходниках есть заблокированные слои. Они сохранят своё оформление; проверь их сочетание с шаблоном.';
    dialog.showModal();sourceControls();refresh();
  }
  $('template-count').onchange=()=>{const count=Number($('template-count').value);sources=Array.from({length:count},(_,i)=>sources[i]??i%source.frames.length);chosenSlot=Math.min(chosenSlot,count-1);sourceControls();refresh();};
  $('template-device').onchange=refresh;$('template-colors').onchange=refresh;
  $('close-templates').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{job++;release();ready.clear();source=null;});
  $('use-template-set').onclick=()=>{const candidate=ready.get(chosen);if(rendering||!candidate?.project||candidate.renderErrors.some(Boolean))return;try{onVariant(candidate.project);dialog.close();notify('Новая версия открыта. Предыдущее оформление сохранено в «Версиях комплекта».');}catch(error){$('template-progress').textContent=error.message;}};
  $('use-template-frame').onclick=()=>{const candidate=ready.get(chosen);if(rendering||!candidate?.project||candidate.renderErrors[chosenSlot])return;const next=candidate.project.frames[chosenSlot];dialog.close();onFrame(next);notify('Выбранный кадр применён. Действие можно отменить.');};
  return {open};
}
