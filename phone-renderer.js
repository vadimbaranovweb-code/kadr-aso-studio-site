import * as T from './vendor/three/three.module.js';
import {RoomEnvironment} from './vendor/three/RoomEnvironment.js';
import {PHONE,phoneSettings,screenPlacement} from './phone-data.js';
import {makePhone,orientPhone,phoneProjection} from './phone-geometry.js';

let state=null,initError=null,serial=0,pixels=0;
const imageIds=new WeakMap(),cache=new Map();
const unavailable='3D-мокап недоступен. Попробуй перезапустить 3D или выбери обычную рамку в свойствах телефона.';
function clearCache(){for(const value of cache.values())value.canvas.width=value.canvas.height=1;cache.clear();pixels=0;}
export function resetPhoneRenderer(){
  clearCache();initError=null;
  if(state){state.texture?.dispose();state.environment?.dispose();state.pmrem?.dispose();state.phone.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});state.renderer.dispose();state=null;}
}
function initialize(){
  if(initError)throw new Error(initError);
  if(state){if(state.lost)throw new Error(unavailable);return state;}
  try{
    const canvas=document.createElement('canvas');
    const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
    const scene=new T.Scene(),phone=makePhone();scene.add(phone.group);
    const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room,.04);
    room.dispose();scene.environment=environment.texture;scene.environmentIntensity=.8;
    const fill=new T.HemisphereLight(0xeaf3ff,0x63728b,1.3);scene.add(fill);
    const key=new T.DirectionalLight(0xfffaf3,2.3);key.position.set(-120,180,200);scene.add(key);
    const rim=new T.DirectionalLight(0xc9dfff,1.2);rim.position.set(120,30,-130);scene.add(rim);
    state={canvas,renderer,scene,phone,pmrem,environment,key,rim,texture:null,textureKey:null,lost:false};
    const entry=state;
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();entry.lost=true;clearCache();});
    canvas.addEventListener('webglcontextrestored',()=>{if(state===entry){resetPhoneRenderer();document.dispatchEvent(new Event('kadr-3d-restored'));}});
    return state;
  }catch(error){initError=unavailable;throw new Error(unavailable,{cause:error});}
}
function textureFor(s,img,l){
  if(!imageIds.has(img))imageIds.set(img,++serial);
  const key=[imageIds.get(img),l.screenFit,l.screenX,l.screenY,l.screenZoom].join(':');
  if(key===s.textureKey)return s.texture;
  const canvas=document.createElement('canvas'),max=s.renderer.capabilities.maxTextureSize;
  canvas.height=Math.min(max,3072,Math.max(1024,img.height));canvas.width=Math.round(canvas.height*PHONE.screenWidth/PHONE.screenHeight);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#101217';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const p=screenPlacement(img.width,img.height,canvas.width,canvas.height,l);
  ctx.drawImage(img,p.sx,p.sy,p.sw,p.sh,p.dx,p.dy,p.dw,p.dh);
  s.texture?.dispose();s.texture=new T.CanvasTexture(canvas);s.texture.colorSpace=T.SRGBColorSpace;
  s.texture.anisotropy=Math.min(8,s.renderer.capabilities.getMaxAnisotropy());s.textureKey=key;return s.texture;
}
export function renderPhone(layer,img,rect,resolution=1){
  const s=initialize(),l=phoneSettings(layer),local={x:0,y:0,w:rect.w,h:rect.h};
  if(!imageIds.has(img))imageIds.set(img,++serial);
  const key=JSON.stringify([imageIds.get(img),rect.w,rect.h,resolution,...['yaw','pitch','rotation','frameColor','screenFit','screenX','screenY','screenZoom','island','perspective','lightDirection','lightIntensity','reflection'].map(k=>l[k])]);
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  const layout=phoneProjection(l,local),b=layout.bounds;
  const maximum=Math.min(4096,s.renderer.capabilities.maxTextureSize),effective=Math.min(resolution,(maximum-8)/Math.max(b.w,b.h));
  const size=Math.ceil(layout.span*effective),scale=size/layout.span;
  const offsetX=Math.floor((b.x-local.w/2+layout.span/2)*scale)-2;
  const offsetY=Math.floor((b.y-local.h/2+layout.span/2)*scale)-2;
  const width=Math.ceil((b.x+b.w-local.w/2+layout.span/2)*scale)-offsetX+2;
  const height=Math.ceil((b.y+b.h-local.h/2+layout.span/2)*scale)-offsetY+2;
  const camera=layout.camera;camera.setViewOffset(size,size,offsetX,offsetY,width,height);
  orientPhone(s.phone.group,l);s.phone.body.color.set(l.frameColor);s.phone.glass.color.set(l.frameColor).lerp(new T.Color('#ffffff'),.17);
  s.phone.screenMaterial.map=textureFor(s,img,l);s.phone.screenMaterial.needsUpdate=true;
  s.phone.island.visible=l.island;s.phone.reflectionMaterial.opacity=l.reflection*.32;
  const angle=l.lightDirection*Math.PI/180;s.key.position.set(Math.sin(angle)*230,150,Math.cos(angle)*230);
  s.key.intensity=2.3*l.lightIntensity;s.rim.intensity=1.2*l.lightIntensity;s.scene.environmentIntensity=.8*l.lightIntensity;
  s.renderer.setSize(width,height,false);s.renderer.render(s.scene,camera);
  if(s.lost)throw new Error(unavailable);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(s.canvas,0,0);
  const value={canvas,bounds:{x:offsetX/scale+local.w/2-layout.span/2,y:offsetY/scale+local.h/2-layout.span/2,w:width/scale,h:height/scale}};
  // Cache contains raster snapshots only; no source strings or unbounded GPU textures.
  cache.set(key,value);pixels+=width*height;
  while(cache.size>1&&(cache.size>12||pixels>8000000)){const oldest=cache.keys().next().value,v=cache.get(oldest);pixels-=v.canvas.width*v.canvas.height;v.canvas.width=v.canvas.height=1;cache.delete(oldest);}
  return value;
}
