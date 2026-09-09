import {FORMATS} from './model.js';
import {drawFrame} from './render.js';
import {panoramaFor,panoramaScene} from './panorama.js';

export function cutPanorama(canvas,wide,side,width,height){
  canvas.width=width;canvas.height=height;
  canvas.getContext('2d').drawImage(wide,side*width,0,width,height,0,0,width,height);
}
// One cache per export/thumbnail pass: each pair is rendered once and its two
// PNGs are exact integer-pixel slices, including gradients, shadows and 3D.
export function createFrameRenderer(project,images){
  const cache=new Map();
  return (canvas,frame,format=project.format,resolution=project.exportScale)=>{
    const p=panoramaFor(project,frame.id);
    if(!p)return drawFrame(canvas,frame,images,format,resolution);
    const key=`${p.id}:${format}:${resolution}`;
    let entry=cache.get(key);
    if(!entry){
      // Retain at most one wide raster, even when exporting six frames at 3×.
      for(const old of cache.values())old.wide.width=old.wide.height=1;cache.clear();
      const wide=document.createElement('canvas'),result=drawFrame(wide,panoramaScene(project,p),images,format,resolution);entry={wide,result,seen:new Set()};cache.set(key,entry);
    }
    const [w,h]=FORMATS[format],side=p.frameIds.indexOf(frame.id),pw=Math.round(w*resolution),ph=Math.round(h*resolution);
    cutPanorama(canvas,entry.wide,side,pw,ph);
    entry.seen.add(side);if(entry.seen.size===2){entry.wide.width=entry.wide.height=1;cache.delete(key);}
    return {layers:[],width:w,height:h,unitWidth:w,errors:entry.result.errors,warnings:entry.result.warnings};
  };
}
