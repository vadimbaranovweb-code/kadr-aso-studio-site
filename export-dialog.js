import {FORMATS} from './model.js';
import {activeLocale,localeLabel,localeList,localeStatus} from './localization.js';
import {versionLabel} from './project-versions.js';
import {panoramaFor} from './panorama.js';
import {buildDownloadPlan} from './download-plan.js';
const $=id=>document.getElementById(id),node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function createExportDialog({getProject,getFrameId,onRun,onReview,onPreferences}){
  const dialog=$('export-dialog');let busy=false,url=null;
  function options(){return {scope:$('export-scope').value,format:$('export-formats').value,scale:Number($('export-resolution').value),frameId:getFrameId(),codes:[...$('export-language-list').querySelectorAll('input:checked')].map(e=>e.value)};}
  function error(text=''){$('export-error').hidden=!text;$('export-error').textContent=text;}
  function clearResult(){if(url)URL.revokeObjectURL(url);url=null;$('export-result').hidden=true;$('export-download-link').removeAttribute('href');}
  function summary(){
    const o=options(),p=getProject();$('export-languages').hidden=o.scope!=='languages';
    try{
      const plan=buildDownloadPlan(p,o),single=o.scope==='frame'&&plan.length===1,host=$('export-summary');host.replaceChildren();
      host.append(node('strong',single?'1 файл PNG':`${plan.length} файлов PNG в ZIP`));
      const formats=[...new Set(plan.map(i=>`${i.width} × ${i.height} px`))];host.append(node('p',formats.join(' · ')));
      host.append(node('p',`Языки: ${[...new Set(plan.map(i=>localeLabel(i.code)))].join(', ')}`));
      if(!single)host.append(node('p',`Пример файла: ${plan[0].name}`));
      if(o.scope!=='languages'&&p.localization&&!localeStatus(p,activeLocale(p)).reviewed)host.append(node('p','Текущий язык ещё не отмечен как проверенный. Его можно скачать для просмотра.'));
      $('export-run').textContent=single?'Подготовить PNG':'Подготовить ZIP';$('export-run').disabled=busy;
    }catch(e){$('export-summary').textContent=e.message;$('export-run').disabled=true;}
  }
  function setBusy(value){busy=value;dialog.querySelectorAll('button,select,input').forEach(e=>e.disabled=value);if(!value){$('export-language-list').querySelectorAll('input').forEach(e=>e.disabled=e.dataset.ready!=='true');const pair=panoramaFor(getProject(),getFrameId());$('export-scope').querySelector('option[value=pair]').disabled=!pair;summary();}}
  for(const id of ['export-scope','export-formats','export-resolution'])$(id).onchange=()=>{error();clearResult();$('export-progress').textContent='';summary();};
  $('export-run').onclick=async()=>{
    if(busy)return;clearResult();const base=getProject(),o=options();setBusy(true);error();
    try{
      const plan=buildDownloadPlan(base,o),result=await onRun(plan,o,text=>$('export-progress').textContent=text);
      url=URL.createObjectURL(result.blob);const link=$('export-download-link');link.href=url;link.download=result.name;link.textContent=`Скачать ${result.name.endsWith('.png')?'PNG':'ZIP'}`;
      $('export-result-warning').textContent=result.warnings?'В некоторых кадрах есть замечания к тексту. Проверь результат.':'';
      $('export-result').hidden=false;$('export-progress').textContent='Готово';onPreferences(o);link.click();
    }catch(e){error(e.message);}finally{setBusy(false);}
  };
  $('export-close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('export-review-languages').onclick=()=>{dialog.close();onReview();};
  return {open({scope='set',codes=[]}={}){
    if(dialog.open)return;const p=getProject();clearResult();error();$('export-progress').textContent='';
    $('export-context').textContent=`${versionLabel(p)} · ${localeLabel(activeLocale(p))}`;
    const pair=panoramaFor(p,getFrameId());$('export-scope').querySelector('option[value=pair]').disabled=!pair;
    $('export-scope').value=scope==='pair'&&!pair?'frame':scope;
    $('export-formats').value=p.exportBothFormats?'both':p.format;$('export-resolution').value=String(p.exportScale);
    const host=$('export-language-list');host.replaceChildren();
    for(const item of localeList(p)){
      const ready=localeStatus(p,item.code).reviewed,label=node('label'),check=node('input');check.type='checkbox';check.value=item.code;check.dataset.ready=String(ready);check.disabled=!ready;check.checked=ready&&(codes.length?codes.includes(item.code):true);
      label.append(check,node('span',`${localeLabel(item.code)}${ready?'':' · нужна проверка'}`));host.append(label);check.onchange=()=>{clearResult();summary();};
    }
    setBusy(false);dialog.showModal();
  }};
}
