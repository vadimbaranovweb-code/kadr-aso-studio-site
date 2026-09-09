import {FORMATS,clone} from './model.js';
import {frameUnits,panoramaScene} from './panorama.js';
import {resolveScene} from './layout.js';
import {layerRect,corners,bounds,wrapLines} from './geometry-2d.js';

export const textKey=(sceneId,layerId)=>JSON.stringify([sceneId,layerId]);

// A panorama is one editable scene. Its backing frame layouts must stay intact.
export function textRows(project){
  return frameUnits(project).map(unit=>{
    const owner=unit.panorama??unit.frames[0];
    return {id:owner.id,frameIds:unit.frames.map(f=>f.id),indices:unit.frames.map(f=>project.frames.indexOf(f)),panorama:Boolean(unit.panorama),
      names:unit.frames.map(f=>f.sourceName),layers:owner.layers.filter(l=>l.type==='text')};
  });
}

export function applyTextEdits(project,edits){
  if(!Array.isArray(edits))throw new Error('Не удалось прочитать правки текста.');
  const owners=new Map(frameUnits(project).map(u=>{const s=u.panorama??u.frames[0];return [s.id,s];})),seen=new Set();
  for(const e of edits){
    const key=textKey(e.sceneId,e.layerId),l=owners.get(e.sceneId)?.layers.find(l=>l.id===e.layerId);
    if(seen.has(key)||!l||l.type!=='text')throw new Error('Состав кадров изменился. Открой таблицу заново.');
    seen.add(key);
    if(l.locked)throw new Error('Слой заблокирован. Разблокируй его в редакторе.');
    if(l.text!==e.before)throw new Error('Текст изменился вне таблицы. Открой её заново.');
    if(typeof e.text!=='string'||e.text.length>1000)throw new Error('В одном текстовом слое может быть до 1000 символов.');
  }
  const next=clone(project),targets=new Map(frameUnits(next).map(u=>{const s=u.panorama??u.frames[0];return [s.id,s];}));
  for(const e of edits)targets.get(e.sceneId).layers.find(l=>l.id===e.layerId).text=e.text;
  return next;
}

// Test the rotated blocks, not their axis-aligned enclosing rectangles. Touching
// edges are allowed. This is a layout hint, not recognition of letters or UI.
export function textBlocksOverlap(a,b){
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],length=Math.hypot(q.x-p.x,q.y-p.y);
    if(!length)continue;
    const axis={x:-(q.y-p.y)/length,y:(q.x-p.x)/length};
    const av=a.map(v=>v.x*axis.x+v.y*axis.y),bv=b.map(v=>v.x*axis.x+v.y*axis.y);
    if(Math.min(Math.max(...av),Math.max(...bv))-Math.max(Math.min(...av),Math.min(...bv))<=.5)return false;
  }
  return true;
}

export function checkTextLayouts(project,images,ctx){
  return frameUnits(project).map(unit=>{
    const owner=unit.panorama??unit.frames[0],scene=unit.panorama?panoramaScene(project,unit.panorama):owner,formats={};
    for(const [format,[w,h]] of Object.entries(FORMATS)){
      const resolved=resolveScene(scene,images,format,ctx),width=w*(scene.columns??1),blocks=[];
      for(const l of resolved.layers){
        if(l.type!=='text'||!l.visible||l.opacity===0||!l.text.trim())continue;
        const rect=layerRect(l,null,w,h,ctx),points=corners(rect,l),b=bounds(points),lines=wrapLines(ctx,l.text,rect.w);
        const outside=b.x<-.5||b.y<-.5||b.x+b.w>width+.5||b.y+b.h>h+.5;
        const tooWide=lines.some(line=>ctx.measureText(line).width>rect.w+.5);
        const name=(unit.panorama?`${l.sourceSide===1?'Правая':'Левая'} часть · `:'')+l.name;
        blocks.push({id:l.id,name,side:l.sourceSide??0,points,lines:lines.length,outside,tooWide});
      }
      const issues=blocks.filter(b=>b.outside).map(b=>({kind:'outside',layerId:b.id,relatedId:null,message:`«${b.name}»: выходит за край`}));
      for(const b of blocks)if(b.tooWide)issues.push({kind:'width',layerId:b.id,relatedId:null,message:`«${b.name}»: символ шире текстового блока`});
      for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(textBlocksOverlap(blocks[i].points,blocks[j].points)){
        issues.push({kind:'overlap',layerId:blocks[i].id,relatedId:blocks[j].id,message:`«${blocks[i].name}» и «${blocks[j].name}»: блоки пересекаются`});
      }
      formats[format]={blocks,issues};
    }
    return {id:owner.id,formats};
  });
}
