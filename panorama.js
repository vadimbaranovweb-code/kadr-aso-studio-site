import {clone,uid} from './model.js';

export const panoramaFor=(project,id)=>(project.panoramas??[]).find(p=>p.frameIds.includes(id));
export function panoramaScene(project,p){
  const frames=p.frameIds.map(id=>project.frames.find(f=>f.id===id));
  return {...p,columns:2,image:frames[0].image,sourceName:frames[0].sourceName,demo:frames.every(f=>f.demo),sources:frames.map(f=>({image:f.image,name:f.sourceName}))};
}
export function joinFrames(project,index){
  const pair=project.frames.slice(index,index+2);
  if(!Number.isInteger(index)||index<0||pair.length!==2||pair.some(f=>panoramaFor(project,f.id)))throw new Error('Выбери два соседних кадра, которые ещё не входят в панораму.');
  const layers=pair.flatMap((f,side)=>f.layers.map(l=>({...clone(l),id:uid(),x:l.x+side*100,formatOverrides:Object.fromEntries(Object.entries(l.formatOverrides??{}).map(([f,p])=>[f,{...p,...('x' in p?{x:p.x+side*100}:{})}])),sourceSide:side})));
  if(layers.length>48)throw new Error('В панораме может быть до 48 слоёв.');
  // Keep text above the devices of both frames; custom order within each
  // category is retained. All layers remain editable in the shared scene.
  const p={id:uid(),frameIds:pair.map(f=>f.id),background:pair[0].background,gradient:pair[0].gradient,layers:[...layers.filter(l=>l.type!=='text'),...layers.filter(l=>l.type==='text')]};
  project.panoramas??=[];project.panoramas.push(p);project.version=project.version===7?7:project.versions?6:5;return p;
}
export function restoreSeparateFrames(project,id){project.panoramas=(project.panoramas??[]).filter(p=>p.id!==id);}
export function frameUnits(project){
  const units=[];
  for(let i=0;i<project.frames.length;){const p=panoramaFor(project,project.frames[i].id);const frames=project.frames.slice(i,i+(p?2:1));units.push({frames,panorama:p});i+=frames.length;}
  return units;
}
export function moveFrameUnit(project,index,delta){
  const id=project.frames[index].id,units=frameUnits(project),from=units.findIndex(u=>u.frames.some(f=>f.id===id)),to=from+delta;
  if(to<0||to>=units.length)return;
  const [unit]=units.splice(from,1);units.splice(to,0,unit);project.frames=units.flatMap(u=>u.frames);
}
export function duplicateFrameUnit(project,index){
  const unit=frameUnits(project).find(u=>u.frames.some(f=>f.id===project.frames[index].id));
  if(project.frames.length+unit.frames.length>6)throw new Error('Для копии пары нужны два свободных места в комплекте.');
  const copies=unit.frames.map(f=>({...clone(f),id:uid(),layers:f.layers.map(l=>({...clone(l),id:uid()}))}));
  const end=project.frames.indexOf(unit.frames.at(-1))+1;project.frames.splice(end,0,...copies);
  if(unit.panorama)project.panoramas.push({...clone(unit.panorama),id:uid(),frameIds:copies.map(f=>f.id),layers:unit.panorama.layers.map(l=>({...clone(l),id:uid()}))});
  return copies[0].id;
}
export function removeFrameUnit(project,index){
  const unit=frameUnits(project).find(u=>u.frames.some(f=>f.id===project.frames[index].id));
  if(unit.frames.length===project.frames.length)throw new Error('В проекте должен остаться хотя бы один кадр.');
  const ids=new Set(unit.frames.map(f=>f.id));project.frames=project.frames.filter(f=>!ids.has(f.id));
  if(unit.panorama)restoreSeparateFrames(project,unit.panorama.id);
}
