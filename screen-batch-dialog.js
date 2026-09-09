import {screenTargets,suggestScreenMapping,replaceScreenBatch} from './screen-batch.js';
import {nextVersionName,createProjectVersion,listVersions} from './project-versions.js';
import {MAX_VERSIONS} from './version-data.js';

const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
export function createScreenBatchDialog({getProject,getView,readScreenshot,images,onApply,onClose,notify}){
  const dialog=$('batch-dialog');let base=null,targets=[],uploads=[],mapping={},pending=false;
  function error(message=''){$('batch-error').textContent=message;$('batch-error').hidden=!message;}
  function changes(){return targets.filter(t=>Number.isInteger(mapping[t.key])).map(t=>({key:t.key,previousImage:t.image,source:uploads[mapping[t.key]]}));}
  function count(){return changes().filter(c=>c.source&&(c.previousImage!==c.source.image||targets.find(t=>t.key===c.key).sourceName!==c.source.sourceName)).length;}
  function status(){
    const used=new Set(Object.values(mapping).filter(Number.isInteger)),n=count();
    $('batch-summary').textContent=uploads.length?`Файлов: ${uploads.length} · замен: ${n} · не назначено файлов: ${uploads.length-used.size}`:'Загрузи новые экраны, чтобы назначить их кадрам.';
    $('batch-apply').disabled=pending||!n;$('batch-apply').textContent=$('batch-destination').value==='new'?'Создать версию и заменить':'Применить замену';
    $('batch-name-field').hidden=$('batch-destination').value!=='new';
  }
  function setPending(value){pending=value;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=value);if(!value){$('batch-destination').options[0].disabled=(base.versions?.saved.length??0)+1>=MAX_VERSIONS;renderRows();status();}}
  function dimensions(src){const i=images.get(src);return i?`${i.width} × ${i.height}`:'';}
  function picture(src,name){
    const figure=node('figure'),img=node('img');img.src=src;img.alt=name;img.loading='lazy';
    figure.append(img,node('figcaption',name));return figure;
  }
  function renderRows(){
    const list=$('batch-rows');list.replaceChildren();
    for(const [i,row] of targets.entries()){
      const article=node('article',undefined,'batch-row'),head=node('div',undefined,'batch-row-head');
      head.append(node('h3',row.title));
      const note=row.locked?'Отдельный экран · телефон заблокирован':row.kind==='device'?'Отдельный экран телефона':`Связанных слоёв: ${row.linked}${row.crops?' · вырезок UI: '+row.crops:''}${row.panorama?' · панорама':''}`;
      head.append(node('p',note));
      const label=node('label','Новый экран');label.htmlFor=`batch-target-${i}`;
      const select=node('select');select.id=label.htmlFor;select.disabled=pending||row.locked;
      select.append(new Option('Оставить текущий',''));
      uploads.forEach((u,j)=>select.append(new Option(`${j+1}. ${u.sourceName}`,String(j))));
      select.value=Number.isInteger(mapping[row.key])?String(mapping[row.key]):'';
      const preview=node('div',undefined,'batch-source-pair');
      function updatePreview(){
        preview.replaceChildren(picture(row.image,`Сейчас · ${row.sourceName}`));
        const source=uploads[mapping[row.key]];
        preview.append(source?picture(source.image,`Новый · ${source.sourceName}`):node('p','Без изменений','batch-unchanged'));
        const old=images.get(row.image),next=source&&images.get(source.image);
        const changedRatio=old&&next&&Math.abs(old.width/old.height-next.width/next.height)>.001;
        if(source){const p=node('p',`${dimensions(row.image)} → ${dimensions(source.image)}${changedRatio?' · Пропорции отличаются: проверь заполнение мокапа, высоту плоского телефона и вырезки UI.':row.crops?' · Проверь содержимое вырезок UI после замены.':''}`,'batch-size-note');preview.append(p);}
      }
      select.onchange=()=>{if(select.value==='')delete mapping[row.key];else mapping[row.key]=Number(select.value);error();updatePreview();status();};
      updatePreview();head.append(label,select);article.append(head,preview);list.append(article);
    }
  }
  async function upload(files){
    if(pending||!files.length)return;
    const batch=Array.from(files);
    if(batch.length>12)return error('Выбери до 12 файлов за один раз.');
    if(batch.reduce((n,f)=>n+f.size,0)>72*1024*1024)return error('Общий размер загружаемых файлов — до 72 МБ.');
    setPending(true);error();
    try{
      const next=[];
      for(const [i,file] of batch.entries()){$('batch-progress').textContent=`Открываем экран ${i+1} из ${batch.length}…`;next.push(await readScreenshot(file));}
      uploads=next;mapping=suggestScreenMapping(targets,uploads);
      $('batch-progress').textContent='Основные экраны сопоставлены по уникальным именам, остальные — по порядку выбора. Проверь назначения. Отдельные экраны телефонов выбери вручную.';
    }catch(e){error(e.message);$('batch-progress').textContent='Новая загрузка не применена. Предыдущие назначения сохранены.';}
    finally{setPending(false);}
  }
  function close(){if(!pending)dialog.close();}
  $('batch-upload').onclick=()=>$('batch-input').click();
  $('batch-input').onchange=async e=>{await upload(e.target.files);e.target.value='';};
  $('batch-close').onclick=close;$('batch-cancel').onclick=close;
  $('batch-reset').onclick=()=>{mapping={};error();renderRows();status();};
  $('batch-destination').onchange=status;
  dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
  dialog.addEventListener('close',()=>{base=null;targets=[];uploads=[];mapping={};$('batch-rows').replaceChildren();onClose();});
  window.addEventListener('beforeunload',e=>{if(dialog.open&&(pending||count())){e.preventDefault();e.returnValue='';}});
  $('batch-apply').onclick=async()=>{
    if(pending)return;
    error();setPending(true);
    try{
      if(getProject()!==base)throw new Error('Проект изменился. Закрой это окно и открой замену заново.');
      const result=replaceScreenBatch(base,changes());if(!result.count)throw new Error('Нет изменений для применения.');
      const view=getView(),next=$('batch-destination').value==='new'?createProjectVersion(base,$('batch-version-name').value,view,result.project,view):{project:result.project,view};
      await onApply(next.project,next.view,base);
      pending=false;dialog.close();notify(`Заменено экранов: ${result.count}. Всё действие можно отменить.`);
    }catch(e){error(e.message);setPending(false);}
  };
  return {open(files=[]){
    if(dialog.open||pending)return;
    base=getProject();targets=screenTargets(base);uploads=[];mapping={};error();
    $('batch-progress').textContent='Замена основного экрана обновляет все связанные телефоны и вырезки UI, включая слои с заблокированным положением.';
    $('batch-version-name').value=nextVersionName(base,'Обновление UI');
    const full=listVersions(base).length>=MAX_VERSIONS;
    $('batch-destination').value=full||base.localization?'current':'new';
    $('batch-title').textContent=base.localization?`Заменить экраны UI · ${base.localization.active.code}`:'Заменить экраны UI';
    $('batch-capacity').hidden=!full;
    setPending(false);dialog.showModal();if(files.length)void upload(files);
  }};
}
