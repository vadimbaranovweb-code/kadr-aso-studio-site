import {clone} from './model.js';
import {panoramaFor} from './panorama.js';

// Frame sources feed linked devices and crops. Explicit device images are
// independent targets, even when their bytes happen to equal a frame source.
export function screenTargets(project){
  const rows=[];
  for(const [index,frame] of project.frames.entries()){
    const pair=panoramaFor(project,frame.id),side=pair?.frameIds.indexOf(frame.id)??0;
    const layers=pair?pair.layers.filter(l=>(l.sourceSide??0)===side):frame.layers;
    const linked=layers.filter(l=>l.type==='crop'||l.type==='device'&&!l.image);
    rows.push({key:`frame:${frame.id}`,kind:'frame',frameId:frame.id,sceneId:frame.id,index,
      title:`Кадр ${index+1} · основной экран`,image:frame.image,sourceName:frame.sourceName,
      locked:false,linked:linked.length,crops:linked.filter(l=>l.type==='crop').length,panorama:Boolean(pair)});
    for(const l of layers.filter(l=>l.type==='device'&&l.image))rows.push({
      key:`device:${pair?.id??frame.id}:${l.id}`,kind:'device',frameId:frame.id,sceneId:pair?.id??frame.id,layerId:l.id,index,
      title:`Кадр ${index+1} · ${l.name}`,image:l.image,sourceName:l.sourceName||'Отдельный экран',
      locked:l.locked,linked:1,crops:0,panorama:Boolean(pair)
    });
  }
  return rows;
}

export function suggestScreenMapping(targets,uploads){
  const mapping={},used=new Set(),frames=targets.filter(t=>t.kind==='frame');
  // Only unique exact filenames are matched automatically. All suggestions
  // remain visible and editable before any project mutation.
  for(const row of frames){
    const matches=uploads.map((u,i)=>u.sourceName===row.sourceName?i:-1).filter(i=>i>=0);
    if(matches.length===1&&frames.filter(t=>t.sourceName===row.sourceName).length===1){mapping[row.key]=matches[0];used.add(matches[0]);}
  }
  let cursor=0;
  for(const row of frames){
    if(row.key in mapping)continue;
    while(used.has(cursor))cursor++;
    if(cursor>=uploads.length)break;
    mapping[row.key]=cursor;used.add(cursor++);
  }
  return mapping;
}

function validUpload(u){
  return u&&typeof u.sourceName==='string'&&u.sourceName.length<=200&&typeof u.image==='string'&&
    u.image.length<=18*1024*1024&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u.image);
}
export function replaceScreenBatch(project,changes){
  if(!Array.isArray(changes)||!changes.length)throw new Error('Выбери хотя бы один экран для замены.');
  const targets=new Map(screenTargets(project).map(t=>[t.key,t])),seen=new Set(),jobs=[];
  for(const change of changes){
    const row=targets.get(change.key);
    if(!row||seen.has(change.key))throw new Error('Список экранов изменился. Открой замену заново.');
    if(row.locked)throw new Error('Разблокируй телефон в Pro перед заменой его отдельного экрана.');
    if(row.image!==change.previousImage)throw new Error('Исходник уже изменён. Открой замену заново.');
    if(!validUpload(change.source))throw new Error('Не удалось прочитать новый экран. Используй PNG, JPG или WebP до 12 МБ.');
    seen.add(change.key);
    if(row.image!==change.source.image||row.sourceName!==change.source.sourceName)jobs.push({row,source:change.source});
  }
  if(!jobs.length)return {project,count:0};
  const next=clone(project);
  for(const {row,source} of jobs){
    if(row.kind==='frame')Object.assign(next.frames.find(f=>f.id===row.frameId),{image:source.image,sourceName:source.sourceName,demo:false});
    else{
      const scene=[...next.frames,...(next.panoramas??[])].find(f=>f.id===row.sceneId);
      Object.assign(scene.layers.find(l=>l.id===row.layerId),{image:source.image,sourceName:source.sourceName});
    }
  }
  return {project:next,count:jobs.length};
}
