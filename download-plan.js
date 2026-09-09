import {FORMATS} from './model.js';
import {activeLocale,localeProject,localeStatus} from './localization.js';
import {panoramaFor} from './panorama.js';

export function buildDownloadPlan(p,{scope='set',format='both',scale=1,codes=[],frameId=p.frames[0]?.id}={}){
  if(!['frame','pair','set','languages'].includes(scope))throw new Error('Выбери, что экспортировать.');
  if(![1,2,3].includes(scale))throw new Error('Выбери масштаб PNG.');
  if(format!=='both'&&!FORMATS[format])throw new Error('Выбери размер кадра.');
  const formats=format==='both'?Object.keys(FORMATS):[format],langs=scope==='languages'?codes:[activeLocale(p)];
  if(!langs.length||new Set(langs).size!==langs.length)throw new Error('Выбери хотя бы один проверенный язык.');
  return langs.flatMap(code=>{
    if(scope==='languages'&&!localeStatus(p,code).reviewed)throw new Error(`Сначала проверь тексты и UI: ${code}.`);
    const content=localeProject(p,code);content.exportScale=scale;
    const ids=scope==='pair'?panoramaFor(p,frameId)?.frameIds:scope==='frame'?[frameId]:content.frames.map(f=>f.id);
    if(!ids?.length||!content.frames.some(f=>ids.includes(f.id)))throw new Error('Выбранный кадр или панорама больше недоступны.');
    return formats.flatMap(format=>content.frames.flatMap((frame,index)=>{
      if(!ids.includes(frame.id))return [];
      const [w,h]=FORMATS[format],width=w*scale,height=h*scale;
      return [{project:content,code,frame,index,format,scale,width,height,name:`${scope==='languages'?code+'/':''}${formats.length>1?format+'/':''}${String(index+1).padStart(2,'0')}-${width}x${height}.png`}];
    }));
  });
}
