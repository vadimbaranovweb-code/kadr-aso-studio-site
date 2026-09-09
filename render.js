import {FORMATS} from './model.js';
import {PHONE,isPhone3D} from './phone-data.js';
import {phoneProjection} from './phone-geometry.js';
import {renderPhone} from './phone-renderer.js';
export {FORMATS} from './model.js';
import {wrapLines,font,layerRect,corners,bounds} from './geometry-2d.js';
export {wrapLines,layerRect,projectPoint,corners,pointInPolygon,bounds} from './geometry-2d.js';
import {resolveScene,textLayoutWarnings} from './layout.js';
const rad=d=>d*Math.PI/180;
const surfaceCache=new WeakMap();
const projectionCache=new WeakMap();
function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));}
function blend(hex,t){const n=parseInt(hex.slice(1),16);return `rgb(${[n>>16,(n>>8)&255,n&255].map(x=>Math.round(x+(255-x)*t)).join(',')})`;}
function drawHighlightedLine(ctx,line,l,x,y){
  const key=l.highlight.toLowerCase();
  if(!key){ctx.fillStyle=l.color;ctx.fillText(line,x,y);return;}
  let start=0;
  for(;;){const pos=line.toLowerCase().indexOf(key,start);if(pos<0){ctx.fillStyle=l.color;ctx.fillText(line.slice(start),x,y);break;}
    const before=line.slice(start,pos);ctx.fillStyle=l.color;ctx.fillText(before,x,y);x+=ctx.measureText(before).width;
    const word=line.slice(pos,pos+key.length);ctx.fillStyle=l.highlightColor;ctx.fillText(word,x,y);x+=ctx.measureText(word).width;start=pos+key.length;
  }
}
function drawText(ctx,l,r,w){
  ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.rotate(rad(l.rotation));ctx.translate(-r.w/2,-r.h/2);
  font(ctx,l,w);ctx.textBaseline='top';ctx.textAlign='left';const size=l.fontSize*w/414;
  wrapLines(ctx,l.text,r.w).forEach((line,i)=>{const tw=ctx.measureText(line).width;const x=l.align==='center'?(r.w-tw)/2:l.align==='right'?r.w-tw:0;drawHighlightedLine(ctx,line,l,x,i*size*l.lineHeight);});ctx.restore();
}
function surface(l,img,r,res){
  let cache=surfaceCache.get(img);if(!cache){cache=new Map();surfaceCache.set(img,cache);}
  const key=JSON.stringify([l.type,r.w,r.h,l.crop,l.radius,l.deviceFrame,l.frameColor,l.border,l.borderColor,res]);
  if(cache.has(key))return cache.get(key);
  const c=document.createElement('canvas'),factor=Math.min(res,2048/Math.max(r.w,r.h));
  c.width=Math.max(1,Math.round(r.w*factor));c.height=Math.max(1,Math.round(r.h*factor));
  const ctx=c.getContext('2d');ctx.scale(c.width/r.w,c.height/r.h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const pad=l.type==='device'&&l.deviceFrame?r.w*.022:0;
  const radius=l.radius*r.w/300;
  if(pad){ctx.fillStyle=l.frameColor;round(ctx,0,0,r.w,r.h,radius);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=.8;round(ctx,.7,.7,r.w-1.4,r.h-1.4,radius);ctx.stroke();}
  ctx.save();round(ctx,pad,pad,r.w-2*pad,r.h-2*pad,Math.max(0,radius-pad));ctx.clip();
  if(l.type==='crop'){const a=l.crop;ctx.drawImage(img,a.x*img.width/100,a.y*img.height/100,a.w*img.width/100,a.h*img.height/100,pad,pad,r.w-2*pad,r.h-2*pad);}
  else ctx.drawImage(img,pad,pad,r.w-2*pad,r.h-2*pad);
  ctx.restore();
  if(l.border){ctx.strokeStyle=l.borderColor;ctx.lineWidth=l.border;round(ctx,l.border/2,l.border/2,r.w-l.border,r.h-l.border,radius);ctx.stroke();}
  if(cache.size>=6)cache.delete(cache.keys().next().value);cache.set(key,c);return c;
}
function inverseHomography(pts){
  const [p,q,r,t]=pts,dx1=q.x-r.x,dx2=t.x-r.x,dy1=q.y-r.y,dy2=t.y-r.y;
  const sx=p.x-q.x+r.x-t.x,sy=p.y-q.y+r.y-t.y,den=dx1*dy2-dx2*dy1;
  const g=(sx*dy2-dx2*sy)/den,h=(dx1*sy-sx*dy1)/den;
  const a=q.x-p.x+g*q.x,b=t.x-p.x+h*t.x,c=p.x,d=q.y-p.y+g*q.y,e=t.y-p.y+h*t.y,f=p.y;
  const det=a*(e-f*h)-b*(d-f*g)+c*(d*h-e*g);
  return [(e-f*h)/det,(c*h-b)/det,(b*f-c*e)/det,(f*g-d)/det,(a-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det];
}
// Inverse mapping samples the source once per output pixel. No overlapping
// triangle clips or expanded image copies, including at 3x export resolution.
function warpSurface(source,local,layer,res){
  const b=bounds(corners(local,layer)),c=document.createElement('canvas');
  const factor=Math.min(res,2048/Math.max(b.w,b.h));c.width=Math.max(1,Math.ceil(b.w*factor));c.height=Math.max(1,Math.ceil(b.h*factor));
  const dw=c.width,dh=c.height,sw=source.width,sh=source.height;
  const pts=corners(local,layer).map(p=>({x:(p.x-b.x)*dw/b.w,y:(p.y-b.y)*dh/b.h}));
  const m=inverseHomography(pts),pixels=source.getContext('2d').getImageData(0,0,sw,sh).data;
  const ctx=c.getContext('2d'),out=ctx.createImageData(dw,dh),dest=out.data;
  for(let y=0;y<dh;y++){
    const yy=y+.5;let ax=m[0]*.5+m[1]*yy+m[2],ay=m[3]*.5+m[4]*yy+m[5],az=m[6]*.5+m[7]*yy+m[8];
    for(let x=0;x<dw;x++,ax+=m[0],ay+=m[3],az+=m[6]){
      const u=ax/az,v=ay/az;if(u<0||v<0||u>1||v>1)continue;
      const fx=Math.min(sw-1,Math.max(0,u*sw-.5)),fy=Math.min(sh-1,Math.max(0,v*sh-.5));
      const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(x0+1,sw-1),y1=Math.min(y0+1,sh-1),tx=fx-x0,ty=fy-y0;
      const i=(y*dw+x)*4,a=(y0*sw+x0)*4,b0=(y0*sw+x1)*4,d=(y1*sw+x0)*4,e=(y1*sw+x1)*4;
      const w0=(1-tx)*(1-ty),w1=tx*(1-ty),w2=(1-tx)*ty,w3=tx*ty;
      for(let k=0;k<4;k++)dest[i+k]=pixels[a+k]*w0+pixels[b0+k]*w1+pixels[d+k]*w2+pixels[e+k]*w3;
    }
  }
  ctx.putImageData(out,0,0);return {canvas:c,bounds:b};
}
function bitmap(ctx,l,r,img,res){
  const s=surface(l,img,r,res);
  if(!(l.yaw||l.pitch)){
    ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);ctx.rotate(rad(l.rotation));
    if(l.shadow){ctx.shadowColor='rgba(7,13,40,.25)';ctx.shadowBlur=l.shadow*res;ctx.shadowOffsetY=l.shadow*.45*res;}
    ctx.drawImage(s,-r.w/2,-r.h/2,r.w,r.h);ctx.restore();return;
  }
  let cache=projectionCache.get(s);if(!cache){cache=new Map();projectionCache.set(s,cache);}
  const key=JSON.stringify([l.yaw,l.pitch,l.rotation,res]);let projected=cache.get(key);
  if(!projected){
    projected=warpSurface(s,{...r,x:0,y:0},l,res);
    if(cache.size>=3)cache.delete(cache.keys().next().value);cache.set(key,projected);
  }
  const b=projected.bounds;
  ctx.save();if(l.shadow){ctx.shadowColor='rgba(7,13,40,.25)';ctx.shadowBlur=l.shadow*res;ctx.shadowOffsetY=l.shadow*.45*res;}
  ctx.drawImage(projected.canvas,r.x+b.x,r.y+b.y,b.w,b.h);ctx.restore();
}
export function materializeLegacy(frame,img,format,ctx){
  if(!frame.legacy)return;
  const f=frame.legacy,[w,h]=FORMATS[format],pad=Math.round(w*.085),textWidth=w-pad*2;let size=f.fontSize*w/414,lines;
  do{ctx.font=`700 ${size}px Arial`;lines=wrapLines(ctx,f.headline,textWidth);if(lines.length*size*1.12<=h*.255||size<=23)break;size-=1;}while(size>20);
  let y=h*.062+lines.length*size*1.12,sub=17*w/414,subY=y+15;
  if(f.subtitle.trim()){let sl;do{ctx.font=`400 ${sub}px Arial`;sl=wrapLines(ctx,f.subtitle,textWidth);if(sl.length*sub*1.4<=h*.16||sub<=12)break;sub-=.5;}while(sub>11);y=subY+sl.length*sub*1.4;}
  const top=Math.max(h*.315,y+32),bottom=h-34,availableH=Math.max(80,bottom-top),ratio=img.width/img.height,fp=f.deviceFrame?7:0;
  const maxW=Math.min(w*.9-2*fp,(availableH-2*fp)*ratio),iw=maxW*f.screenScale/94,ow=iw+2*fp,oh=iw/ratio+2*fp;
  const sy=Math.min(bottom-oh,Math.max(y+18,top+(availableH-oh)/2+f.screenPosition*h/896));
  const headline=frame.layers.find(l=>l.role==='headline'),subtitle=frame.layers.find(l=>l.role==='subtitle'),phone=frame.layers.find(l=>l.type==='device');
  Object.assign(headline,{x:pad/w*100,y:6.2,width:textWidth/w*100,fontSize:size*414/w});
  Object.assign(subtitle,{x:pad/w*100,y:subY/h*100,width:textWidth/w*100,fontSize:sub*414/w});
  Object.assign(phone,{x:(w-ow)/2/w*100,y:sy/h*100,width:ow/w*100});for(const l of frame.layers){l.layoutFormat=format;l.resizeAnchor??='auto';l.formatOverrides??={};}delete frame.legacy;
}
export function drawFrame(canvas,frame,images,format='414x896',resolution=2){
  const [w,h]=FORMATS[format],columns=frame.columns===2?2:1,totalWidth=w*columns;canvas.width=Math.round(w*resolution)*columns;canvas.height=Math.round(h*resolution);
  const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const original=images.get(frame.image);if(!original)return {layers:[],width:totalWidth,height:h,unitWidth:w,errors:[{message:'Не удалось загрузить исходный экран.'}],warnings:[]};
  materializeLegacy(frame,original,format,ctx);
  frame=resolveScene(frame,images,format,ctx);
  ctx.fillStyle=frame.background;ctx.fillRect(0,0,totalWidth,h);
  if(frame.gradient){const g=ctx.createLinearGradient(0,0,totalWidth,h);g.addColorStop(0,blend(frame.background,.17));g.addColorStop(.6,frame.background);g.addColorStop(1,blend(frame.background,.06));ctx.fillStyle=g;ctx.fillRect(0,0,totalWidth,h);}
  const geometry=[],errors=[];
  for(const l of frame.layers){
    const img=(l.type==='image'||l.type==='device'&&l.image)?images.get(l.image):images.get(frame.sources?.[l.sourceSide??0]?.image)??original;if(!img||!l.visible)continue;
    const r=layerRect(l,img,w,h,ctx),projection=isPhone3D(l)?phoneProjection(l,r):null;
    const pts=projection?.points??corners(r,l);geometry.push({id:l.id,rect:r,points:pts,bounds:projection?.bounds??bounds(pts),locked:l.locked});
    ctx.save();ctx.globalAlpha=l.opacity;
    if(l.type==='text')drawText(ctx,l,r,w);
    else if(isPhone3D(l)){
      try{const {canvas:phone,bounds:b}=renderPhone(l,img,r,resolution);applyPhoneShadow(ctx,l,resolution);ctx.drawImage(phone,r.x+b.x,r.y+b.y,b.w,b.h);}
      catch(error){errors.push({id:l.id,message:error.message});ctx.strokeStyle='#ed5670';ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.setLineDash([]);ctx.fillStyle='#ed5670';ctx.font='18px Arial';ctx.fillText('3D недоступно',r.x+10,r.y+30);}
    }else bitmap(ctx,l,r,img,resolution);
    ctx.restore();
  }
  return {layers:geometry,width:totalWidth,height:h,unitWidth:w,errors,warnings:textLayoutWarnings(frame,geometry,totalWidth,h)};
}
function applyPhoneShadow(ctx,l,res){if(l.shadow){ctx.shadowColor='rgba(7,13,40,.28)';ctx.shadowBlur=l.shadow*res;ctx.shadowOffsetY=l.shadow*.45*res;}}
export function drawPhoneOnly(canvas,layer,img,width,resolution){
  const r={x:0,y:0,w:width,h:width*PHONE.height/PHONE.width},result=renderPhone(layer,img,r,resolution),b=result.bounds;
  const pad=Math.ceil(layer.shadow*2.5+4);canvas.width=Math.ceil((b.w+pad*2)*resolution);canvas.height=Math.ceil((b.h+pad*2)*resolution);
  const ctx=canvas.getContext('2d');ctx.scale(resolution,resolution);ctx.globalAlpha=layer.opacity;applyPhoneShadow(ctx,layer,resolution);ctx.drawImage(result.canvas,pad,pad,b.w,b.h);
  return {width:canvas.width,height:canvas.height};
}
