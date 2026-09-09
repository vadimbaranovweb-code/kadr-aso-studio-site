import {MAX_VERSIONS} from './version-data.js';
import {listVersions,nextVersionName,createProjectVersion,switchProjectVersion,renameProjectVersion,removeProjectVersion,exportProjectVersion} from './project-versions.js';

const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function createVersionsDialog({getProject,getView,onApply,onUndo,canUndo,onDownload,notify}){
  const $=id=>document.getElementById(id),dialog=$('versions-dialog'),list=$('version-list');let pending=false,steps=0;
  function availability(){
    dialog.querySelectorAll('button,input').forEach(n=>n.disabled=pending);
    $('version-create').disabled=pending||listVersions(getProject()).length>=MAX_VERSIONS;
    $('version-undo').disabled=pending||!steps||!canUndo();
  }
  function error(e){$('version-error').hidden=false;$('version-error').textContent=e.message||'Не удалось изменить версии.';}
  async function perform(make,{close=false,message=''}={}){
    if(pending)return;pending=true;availability();$('version-error').hidden=true;$('version-progress').textContent='Открываем версию…';
    try{
      const base=getProject(),result=make(base,getView());await onApply(result.project,result.view,base);steps++;
      render();if(close)dialog.close();if(message)notify(message);
    }catch(e){error(e);}finally{pending=false;$('version-progress').textContent='';availability();}
  }
  function action(label,fn,primary=false){const b=el('button','button'+(primary?' primary':''),label);b.type='button';b.onclick=fn;return b;}
  function render(){
    const project=getProject(),versions=listVersions(project);list.replaceChildren();$('version-count').textContent=`${versions.length} / ${MAX_VERSIONS}`;
    for(const [i,v] of versions.entries()){
      const card=el('article','version-card'+(v.current?' is-current':'')),heading=el('div','version-card-heading');
      heading.append(el('strong','version-number',String(i+1).padStart(2,'0')));
      const title=el('div');title.append(el('h3','',v.name));
      const pieces=[`${v.project.frames.length} кадр.`,`${v.project.panoramas?.length??0} панорам`,v.current?'Открыта в редакторе':`Сохранена ${new Date(v.updatedAt).toLocaleString('ru-RU')}`];
      title.append(el('p','version-meta',pieces.join(' · ')));heading.append(title);
      if(v.current)heading.append(el('span','version-active','Текущая'));card.append(heading);
      const names=el('p','version-sources',v.project.frames.map(f=>f.sourceName).join(' · '));card.append(names);
      const actions=el('div','version-actions');
      if(!v.current)actions.append(action('Открыть',()=>perform((p,view)=>switchProjectVersion(p,v.id,view),{close:true,message:'Версия открыта. Предыдущая работа сохранена в списке версий.'}),true));
      actions.append(action('Скачать эту версию',()=>{try{const single=exportProjectVersion(getProject(),v.id);onDownload(single.project,single.label);}catch(e){error(e);}}));
      const rename=el('details','version-rename'),summary=el('summary','', 'Переименовать'),form=el('form'),label=el('label','sr-only','Название версии'),input=el('input');
      input.type='text';input.maxLength=60;input.value=v.name;input.required=true;input.id=`version-name-${i}`;label.htmlFor=input.id;
      const submit=el('button','button','Сохранить имя');submit.type='submit';form.append(label,input,submit);rename.append(summary,form);
      form.onsubmit=e=>{e.preventDefault();if(input.value.trim()===v.name){rename.open=false;return;}perform((p,view)=>renameProjectVersion(p,v.id,input.value,view));};
      actions.append(rename);
      if(!v.current)actions.append(action('Удалить',()=>perform((p,view)=>removeProjectVersion(p,v.id,view),{message:'Версия удалена. Кнопка «Отменить действие» вернёт её.'})));
      card.append(actions);list.append(card);
    }
    $('version-new-name').value=nextVersionName(project);availability();
  }
  function open(){if(dialog.open)return;steps=0;pending=false;$('version-error').hidden=true;$('version-progress').textContent='';render();dialog.showModal();$('versions-body').scrollTop=0;}
  $('version-create-form').onsubmit=e=>{e.preventDefault();perform((p,view)=>createProjectVersion(p,$('version-new-name').value,view),{close:true,message:'Копия открыта. Исходная версия сохранена отдельно.'});};
  $('version-undo').onclick=()=>{if(pending||!steps||!canUndo())return;onUndo();steps--;render();};
  $('versions-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  return {open};
}
