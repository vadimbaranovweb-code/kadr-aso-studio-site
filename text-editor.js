import {FORMATS,clone} from './model.js';
import {textRows,textKey,applyTextEdits,checkTextLayouts} from './text-workbook.js';

const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const sizeLabel=f=>f.replace('x',' × ');
export function createTextEditor({getProject,images,onApply,notify}){
  const $=id=>document.getElementById(id),dialog=$('text-dialog'),body=$('text-rows'),measure=document.createElement('canvas').getContext('2d');
  let source=null,rows=[],timer=null;
  const edits=new Map(),checks=new Map(),fields=new Map();
  const changes=()=>[...edits.values()].filter(e=>e.text!==e.before);
  function status(){const count=changes().length;$('text-apply').disabled=!count;$('text-change-count').textContent=count?`Изменено слоёв: ${count}`:'Изменений пока нет';}
  function showError(error){$('text-error').textContent=error.message||'Не удалось применить правки.';$('text-error').hidden=false;}
  function commit(focus=null){
    try{
      const pending=changes(),next=applyTextEdits(getProject(),pending);
      if(focus)next.format=focus.format;
      onApply(next,focus,pending.length);dialog.close();
      if(pending.length)notify('Тексты применены к обоим размерам. «Отменить» вернёт предыдущие.');
    }catch(error){showError(error);}
  }
  function field(row,l){
    const key=textKey(row.id,l.id),wrap=el('div','copy-field'),label=el('label'),input=el('textarea');
    const id=`copy-field-${fields.size}`;
    label.htmlFor=id;label.textContent=(row.panorama?`${l.sourceSide===1?'Правая':'Левая'} часть · `:'')+l.name;
    input.id=id;input.value=l.text;input.maxLength=1000;input.rows=l.role==='subtitle'?3:4;input.lang=source.localization?.active.code??'en';input.spellcheck=true;input.readOnly=l.locked;
    const notes=el('div','copy-field-notes'),state=el('span','',[(l.locked?'Заблокирован':''),(!l.visible?'Скрыт':''),(l.opacity===0?'Прозрачный':'')].filter(Boolean).join(' · ')),count=el('span','',`${l.text.length} / 1000`);
    notes.id=id+'-notes';input.setAttribute('aria-describedby',notes.id);notes.append(state,count);wrap.append(label,input,notes);
    edits.set(key,{sceneId:row.id,layerId:l.id,before:l.text,text:l.text});fields.set(key,{input,wrap});
    input.oninput=()=>{edits.get(key).text=input.value;count.textContent=`${input.value.length} / 1000`;wrap.classList.toggle('is-edited',input.value!==l.text);$('text-error').hidden=true;status();scheduleChecks();};
    return wrap;
  }
  function jump(row,format,id=null){
    const l=row.layers.find(l=>l.id===id),frameId=row.frameIds[row.panorama?(l?.sourceSide??0):0];
    commit({frameId,layerId:id,format,panorama:row.panorama});
  }
  function buildRows(){
    body.replaceChildren();
    for(const row of rows){
      const tr=el('tr'),heading=el('th','copy-frame');heading.scope='row';
      heading.append(el('strong','',row.indices.map(i=>String(i+1).padStart(2,'0')).join('–')),el('span','',row.panorama?'Панорама':'Кадр'));
      heading.append(el('span','copy-source',row.names.join(' / ')));tr.append(heading);
      for(const [role,title] of [['headline','Заголовок'],['subtitle','Подзаголовок']]){
        const td=el('td','copy-content');td.dataset.column=title;
        const layers=row.layers.filter(l=>l.role===role);
        if(layers.length)layers.forEach(l=>td.append(field(row,l)));else td.append(el('p','copy-empty','Нет такого слоя'));
        tr.append(td);
      }
      for(const format of Object.keys(FORMATS)){
        const td=el('td','copy-check');td.dataset.column=sizeLabel(format);const list=el('div'),open=el('button','text-button','Открыть на холсте');open.type='button';
        open.onclick=()=>jump(row,format);td.append(list,open);checks.set(textKey(row.id,format),{list,open});tr.append(td);
      }
      body.append(tr);
      const additional=row.layers.filter(l=>!['headline','subtitle'].includes(l.role));
      if(additional.length){
        const extra=el('tr','copy-extra-row'),td=el('td');td.colSpan=5;
        const details=el('details'),summary=el('summary','',`Дополнительные тексты · ${row.indices.map(i=>i+1).join('–')} · ${additional.length}`),grid=el('div','copy-extra-fields');
        additional.forEach(l=>grid.append(field(row,l)));details.append(summary,grid);td.append(details);extra.append(td);body.append(extra);
      }
    }
  }
  function scheduleChecks(){
    clearTimeout(timer);$('text-check-summary').textContent='Проверяем оба размера…';
    for(const {list,open} of checks.values()){list.replaceChildren(el('p','copy-empty','Проверяем…'));open.textContent=changes().length?'Применить и открыть':'Открыть на холсте';}
    timer=setTimeout(runChecks,200);
  }
  function runChecks(){
    if(!source||!dialog.open)return;
    try{
      const draft=applyTextEdits(source,changes()),report=checkTextLayouts(draft,images,measure);let warningCount=0;
      for(const row of rows){
        const results=report.find(r=>r.id===row.id);
        for(const format of Object.keys(FORMATS)){
          const {list}=checks.get(textKey(row.id,format)),result=results.formats[format];list.replaceChildren();warningCount+=result.issues.length;
          list.append(el('strong',result.issues.length?'copy-attention':'copy-ok',result.issues.length?'Проверь расположение':result.blocks.length?'В границах холста':'Нет видимого текста'));
          if(!result.issues.length&&result.blocks.length)list.append(el('p','copy-check-note','Пересечений текстовых блоков нет.'));
          let more=null;
          result.issues.forEach((issue,index)=>{
            const button=el('button','copy-issue',issue.message);button.type='button';button.title='Применить правки таблицы и открыть этот слой';button.onclick=()=>jump(row,format,issue.layerId);list.append(button);
            if(index>=3){if(!more){more=el('details','copy-more-issues');more.append(el('summary','',`Ещё замечаний: ${result.issues.length-3}`));list.append(more);}more.append(button);}
          });
        }
      }
      $('text-check-summary').textContent=warningCount?'Есть замечания к расположению. Их можно исправить на холсте.':'Проверены оба размера. Выходов за край и пересечений текста не найдено.';
    }catch(error){showError(error);$('text-check-summary').textContent='Не удалось проверить расположение.';}
  }
  function open(){
    if(dialog.open)return;
    source=clone(getProject());rows=textRows(source);edits.clear();checks.clear();fields.clear();$('text-error').hidden=true;
    buildRows();status();dialog.showModal();$('text-scroll').scrollTop=0;runChecks();
  }
  function requestClose(){
    if(changes().length){showError(new Error('Правки ещё не применены. Нажми «Применить тексты» или «Отмена», чтобы их отбросить.'));return;}
    dialog.close();
  }
  $('text-apply').onclick=()=>commit();$('text-cancel').onclick=()=>dialog.close();$('text-close').onclick=requestClose;
  dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});
  dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();if(changes().length)commit();}});
  dialog.addEventListener('close',()=>{clearTimeout(timer);source=null;rows=[];edits.clear();checks.clear();fields.clear();body.replaceChildren();});
  window.addEventListener('beforeunload',e=>{if(dialog.open&&changes().length){e.preventDefault();e.returnValue='';}});
  return {open};
}
