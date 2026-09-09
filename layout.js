import {FORMATS,LAYOUT_FIELDS,clone,clamp} from './model.js';
import {layerRect,corners,bounds} from './geometry-2d.js';
import {isPhone3D} from './phone-data.js';
import {phoneProjection} from './phone-geometry.js';

const metadata=['layoutFormat','formatOverrides'];
export function layerImage(scene,layer,images){
  return images.get(layer.image??scene.sources?.[layer.sourceSide??0]?.image??scene.image);
}
export function resolveLayer(layer,scene,images,format,ctx,overrides=true){
  const from=layer.layoutFormat??format,result={...layer};
  if(from!==format){
    const [sw,sh]=FORMATS[from],[w,h]=FORMATS[format],scale=w/sw;
    let anchor={top:0,center:.5,bottom:1}[layer.resizeAnchor];
    if(anchor===undefined){
      const img=layerImage(scene,layer,images);
      if(img){
        const r=layerRect(layer,img,sw,sh,ctx),b=isPhone3D(layer)?phoneProjection(layer,r).bounds:bounds(corners(r,layer));
        const center=(b.y+b.h/2)/sh;
        anchor=center<.35?0:center>.65?1:.5;
      }else anchor=layer.y<30?0:layer.y>65?1:.5;
    }
    // Scale each object uniformly by frame width. Allocate the difference in
    // height above/below it according to its vertical anchor; no UI stretching.
    result.y=clamp((layer.y*sh/100*scale+(h-sh*scale)*anchor)/h*100,-200,200);
  }
  if(overrides)Object.assign(result,layer.formatOverrides?.[format]);
  return result;
}
export function resolveScene(scene,images,format,ctx){
  if(scene.resolvedFormat===format)return scene;
  return {...scene,resolvedFormat:format,layers:scene.layers.map(l=>resolveLayer(l,scene,images,format,ctx))};
}
export function layoutPatch(before,after){
  return Object.fromEntries(Object.keys(after).filter(k=>!metadata.includes(k)&&k!=='id'&&JSON.stringify(before[k])!==JSON.stringify(after[k])).map(k=>[k,after[k]]));
}
export function writeLayerPatch(layer,patch,scene,images,format,scope,ctx){
  const localKeys=Object.keys(patch).filter(k=>LAYOUT_FIELDS.includes(k));
  const shared=Object.fromEntries(Object.entries(patch).filter(([k])=>!LAYOUT_FIELDS.includes(k)&&!metadata.includes(k)&&k!=='id'));
  if(localKeys.length){
    if(scope==='format'){
      layer.formatOverrides??={};layer.formatOverrides[format]??={};
      for(const k of localKeys)layer.formatOverrides[format][k]=clone(patch[k]);
    }else{
      // Rebase the automatic layout, excluding previous manual corrections.
      // Only explicitly edited properties replace manual values in other sizes.
      const automatic=resolveLayer(layer,scene,images,format,ctx,false);
      for(const k of LAYOUT_FIELDS)if(k in automatic)layer[k]=automatic[k];
      layer.layoutFormat=format;
      for(const k of localKeys){layer[k]=clone(patch[k]);for(const correction of Object.values(layer.formatOverrides??{}))delete correction[k];}
    }
  }
  Object.assign(layer,shared);
  // A switch to the flat model must not retain unsupported 3D angles in a size.
  if(patch.deviceModel==='flat'){
    layer.yaw=clamp(layer.yaw,-40,40);layer.pitch=clamp(layer.pitch,-30,30);
    for(const correction of Object.values(layer.formatOverrides??{})){
      if('yaw' in correction)correction.yaw=clamp(correction.yaw,-40,40);
      if('pitch' in correction)correction.pitch=clamp(correction.pitch,-30,30);
    }
  }
  if(layer.formatOverrides)for(const [f,v] of Object.entries(layer.formatOverrides))if(!Object.keys(v).length)delete layer.formatOverrides[f];
}
export function clearFormatCorrections(scene,format,id=null){
  for(const l of scene.layers)if(!l.locked&&(!id||l.id===id))delete l.formatOverrides?.[format];
}
export function correctedLayers(scene,format){return scene.layers.filter(l=>Object.keys(l.formatOverrides?.[format]??{}).length);}
export function textLayoutWarnings(scene,geometry,width,height){
  const warnings=[];
  for(const l of scene.layers){
    if(l.type!=='text'||!l.visible||!l.text.trim())continue;
    const b=geometry.find(g=>g.id===l.id)?.bounds;if(!b)continue;
    if(b.x<-.5||b.y<-.5||b.x+b.w>width+.5||b.y+b.h>height+.5)warnings.push({id:l.id,message:`«${l.name}»: блок текста выходит за край холста`});
  }
  return warnings;
}
