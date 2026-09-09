import {uid} from './uid.js';
import {PHONE_DEFAULTS,poseOf} from './phone-data.js';
import {validateReferenceRecipe} from './reference-data.js';
import {validateVersionBook} from './version-data.js';
import {validateLocalization} from './locale-schema.js';
export const FORMATS = {'414x896':[414,896], '440x956':[440,956]};
export const LAYOUT_FIELDS=['x','y','width','rotation','fontSize','lineHeight','align','yaw','pitch','perspective','screenFit','screenZoom','screenX','screenY'];
export const PALETTES = {
  blue:{background:'#3153f4',textColor:'#ffffff',gradient:true},
  light:{background:'#e8edf7',textColor:'#202b48',gradient:true},
  dark:{background:'#202735',textColor:'#ffffff',gradient:true}
};
export const FONTS = ['Arial','Trebuchet MS','Georgia','Impact'];
export {uid};
export const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])) : value;
export const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
export function textLayer(text='Your next big idea',role='text') {
  return {layoutFormat:'414x896',resizeAnchor:'auto',formatOverrides:{},id:uid(),type:'text',role,name:role==='headline'?'Заголовок':role==='subtitle'?'Подзаголовок':'Текст',text,x:8,y:6,width:84,rotation:0,visible:true,locked:false,opacity:1,fontSize:42,fontFamily:'Arial',fontWeight:700,lineHeight:1.12,align:'left',color:'#ffffff',highlight:'',highlightColor:'#bcff70'};
}
export function deviceLayer(){return {...PHONE_DEFAULTS,layoutFormat:'414x896',resizeAnchor:'auto',formatOverrides:{},id:uid(),type:'device',name:'Телефон',x:15,y:29,width:70,rotation:0,yaw:0,pitch:0,visible:true,locked:false,opacity:1,deviceFrame:true,frameColor:'#171923',radius:30,shadow:25};}
export function cropLayer(){return {layoutFormat:'414x896',resizeAnchor:'auto',formatOverrides:{},id:uid(),type:'crop',name:'Фрагмент интерфейса',x:8,y:58,width:84,rotation:0,visible:true,locked:false,opacity:1,crop:{x:5,y:20,w:90,h:22},radius:18,shadow:22,border:2,borderColor:'#ffffff'};}
export function graphicLayer(image,name){return {layoutFormat:'414x896',resizeAnchor:'auto',formatOverrides:{},id:uid(),type:'image',name:name.slice(0,100),image,x:25,y:35,width:50,rotation:0,visible:true,locked:false,opacity:1,radius:0,shadow:0,border:0,borderColor:'#ffffff'};}
export function defaultFrame(image,name='Демонстрационный экран') {
  const headline=textLayer('Your day.\nA little clearer.','headline');
  const subtitle={...textLayer('Plan less. Do more of what you love.','subtitle'),fontSize:17,fontWeight:400,lineHeight:1.4,y:19.5,opacity:.85};
  return {id:uid(),image,sourceName:name,demo:true,background:PALETTES.blue.background,gradient:true,composition:'hero',layers:[deviceLayer(),headline,subtitle]};
}
export function applyComposition(frame,name){
  let phone=frame.layers.find(l=>l.type==='device');
  if(!phone){phone=deviceLayer();frame.layers.unshift(phone);}
  const headline=frame.layers.find(l=>l.role==='headline');
  const subtitle=frame.layers.find(l=>l.role==='subtitle');
  const set=(l,v)=>{if(l&&!l.locked)Object.assign(l,v);};
  set(headline,{x:8,y:6,width:84,rotation:0,align:'left',fontSize:42});
  set(subtitle,{x:8,y:19.5,width:84,rotation:0,fontSize:17});
  set(phone,{x:15,y:29,width:70,rotation:0,yaw:0,pitch:0});
  if(name==='tilt'){
    set(headline,{width:85,fontSize:43});set(subtitle,{width:72});
    set(phone,{x:14,y:31,width:77,rotation:-9,yaw:-19,pitch:7,shadow:32});
  }else if(name==='focus'){
    set(headline,{align:'center',fontSize:42});set(subtitle,{align:'center'});
    set(phone,{x:22,y:31,width:56,shadow:18});
    let crop=frame.layers.find(l=>l.type==='crop');
    if(!crop){crop=cropLayer();frame.layers.push(crop);}
    set(crop,{x:6,y:56,width:88,rotation:-3,visible:true});
  }
  frame.composition=name;
}
export function applyPalette(frame,name){const p=PALETTES[name];frame.background=p.background;frame.gradient=p.gradient;frame.layers.filter(l=>l.type==='text'&&!l.locked).forEach(l=>l.color=p.textColor);}

const imagePattern=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const fail=message=>{throw new Error(message);};
const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const color=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
export function validImage(s){return typeof s==='string'&&s.length<=24000000&&imagePattern.test(s);}
function validateLayers(raw,version,panorama=false,format='414x896'){
    if(!Array.isArray(raw)||raw.length>(panorama?48:24))fail(panorama?'В панораме может быть до 48 слоёв.':'В кадре должно быть не больше 24 слоёв.');
    const layers=raw.map(l=>{
      if(!l||!['text','device','crop','image'].includes(l.type)||typeof l.name!=='string'||l.name.length>200)fail('В файле некорректный слой.');
      for(const [k,min,max] of [['x',-200,panorama?300:200],['y',-200,200],['width',2,250],['rotation',-180,180],['opacity',0,1]])if(!number(l[k],min,max))fail('В файле некорректные координаты слоя.');
      if(typeof l.visible!=='boolean'||typeof l.locked!=='boolean')fail('В файле некорректное состояние слоя.');
      const clean={id:uid(),type:l.type,name:l.name,x:l.x,y:l.y,width:l.width,rotation:l.rotation,opacity:l.opacity,visible:l.visible,locked:l.locked};
      if(panorama){if(![0,1].includes(l.sourceSide))fail('В панораме некорректный источник слоя.');clean.sourceSide=l.sourceSide;}
      if((l.type==='crop'&&l.templatePart==='detail')||(l.type==='device'&&l.templatePart==='companion'))clean.templatePart=l.templatePart;
      if(l.type==='crop'&&l.referencePart==='detail')clean.referencePart='detail';
      if(l.type==='text'){
        if(typeof l.text!=='string'||l.text.length>1000||!FONTS.includes(l.fontFamily)||![400,600,700,800,900].includes(l.fontWeight)||!number(l.fontSize,10,110)||!number(l.lineHeight,.8,2)||!['left','center','right'].includes(l.align)||!color(l.color)||typeof l.highlight!=='string'||l.highlight.length>100||!color(l.highlightColor))fail('В файле некорректный текстовый слой.');
        Object.assign(clean,Object.fromEntries(['text','fontFamily','fontWeight','fontSize','lineHeight','align','color','highlight','highlightColor'].map(k=>[k,l[k]])));
        if(['headline','subtitle','text'].includes(l.role))clean.role=l.role;
      }else{
        if(!number(l.radius,0,100)||!number(l.shadow,0,60))fail('В файле некорректная маска слоя.');
        Object.assign(clean,{radius:l.radius,shadow:l.shadow});
        if(l.type==='device'){
          const max=version>=3?180:40,minPitch=version>=3?-180:-30,maxPitch=version>=3?180:30;
          if(!number(l.yaw,-max,max)||!number(l.pitch,minPitch,maxPitch)||!color(l.frameColor)||typeof l.deviceFrame!=='boolean')fail('В файле некорректный мокап.');
          Object.assign(clean,PHONE_DEFAULTS,{yaw:l.yaw,pitch:l.pitch,frameColor:l.frameColor,deviceFrame:l.deviceFrame});
          if(version>=3){
            if(!['flat','iphone17'].includes(l.deviceModel)||!['contain','cover'].includes(l.screenFit)||typeof l.island!=='boolean')fail('В файле некорректная модель телефона.');
            for(const [k,min,max] of [['screenX',0,100],['screenY',0,100],['screenZoom',1,3],['perspective',15,60],['lightDirection',-180,180],['lightIntensity',.25,2],['reflection',0,1]])if(!number(l[k],min,max))fail('В файле некорректные настройки 3D.');
            if(l.image!==null&&!validImage(l.image))fail('Не удалось прочитать экран телефона.');
            if(typeof l.sourceName!=='string'||l.sourceName.length>200)fail('В файле некорректное имя экрана.');
            for(const key of Object.keys(PHONE_DEFAULTS))clean[key]=l[key];
            if(l.deviceModel==='flat'&&(!number(l.yaw,-40,40)||!number(l.pitch,-30,30)))fail('В файле некорректная перспектива плоского мокапа.');
          }
        }else{
          if(!number(l.border,0,10)||!color(l.borderColor))fail('В файле некорректная рамка.');
          Object.assign(clean,{border:l.border,borderColor:l.borderColor});
          if(l.type==='crop'){
            const c=l.crop;if(!c||!number(c.x,0,99)||!number(c.y,0,99)||!number(c.w,1,100-c.x+.001)||!number(c.h,1,100-c.y+.001))fail('В файле некорректная область вырезки.');
            clean.crop={x:c.x,y:c.y,w:c.w,h:c.h};
          }else{if(!validImage(l.image))fail('Не удалось прочитать графику.');clean.image=l.image;}
        }
      }
      clean.layoutFormat=version>=5?(l.layoutFormat??format):format;
      clean.resizeAnchor=version>=5?(l.resizeAnchor??'auto'):'auto';
      if(!Object.hasOwn(FORMATS,clean.layoutFormat)||!['auto','top','center','bottom'].includes(clean.resizeAnchor))fail('В файле некорректные настройки ресайза.');
      clean.formatOverrides={};
      const corrections=version>=5?(l.formatOverrides??{}):{};
      if(!corrections||Array.isArray(corrections)||typeof corrections!=='object')fail('В файле некорректные поправки размера.');
      for(const [size,patch] of Object.entries(corrections)){
        if(!Object.hasOwn(FORMATS,size)||!patch||Array.isArray(patch)||typeof patch!=='object')fail('В файле некорректный размер поправок.');
        const allowed=['x','y','width','rotation',...(l.type==='text'?['fontSize','lineHeight','align']:[]),...(l.type==='device'?['yaw','pitch','perspective','screenFit','screenZoom','screenX','screenY']:[])];
        const ranges={x:[-200,panorama?300:200],y:[-200,200],width:[2,250],rotation:[-180,180],fontSize:[10,110],lineHeight:[.8,2],yaw:l.deviceModel==='flat'?[-40,40]:[-180,180],pitch:l.deviceModel==='flat'?[-30,30]:[-180,180],perspective:[15,60],screenZoom:[1,3],screenX:[0,100],screenY:[0,100]};
        const values={align:['left','center','right'],screenFit:['contain','cover']};
        const safe={};for(const [key,v] of Object.entries(patch)){
          if(!allowed.includes(key)||(ranges[key]?!number(v,...ranges[key]):!values[key]?.includes(v)))fail('В файле некорректное значение поправки размера.');
          safe[key]=v;
        }
        if(Object.keys(safe).length)clean.formatOverrides[size]=safe;
      }
      return clean;
    });
  return layers;
}
function validateSingleProject(value){
  if(!value||value.app!=='kadr-aso'||![1,2,3,4,5,6,7].includes(value.version)||!Array.isArray(value.frames)||value.frames.length<1||value.frames.length>6)fail('Это не файл проекта «Кадр» или его версия не поддерживается.');
  if(typeof value.name!=='string'||value.name.length>64||!Object.hasOwn(FORMATS,value.format)||![1,2,3].includes(value.exportScale))fail('В файле некорректные настройки проекта.');
  if(value.exportBothFormats!==undefined&&typeof value.exportBothFormats!=='boolean')fail('В файле некорректные настройки экспорта.');
  const frames=value.frames.map(f=>{
    if(!f||!validImage(f.image)||typeof f.sourceName!=='string'||f.sourceName.length>200||typeof f.demo!=='boolean'||!color(f.background)||typeof f.gradient!=='boolean')fail('Не удалось прочитать экран или его оформление.');
    if(value.version===1){
      if(typeof f.headline!=='string'||f.headline.length>160||typeof f.subtitle!=='string'||f.subtitle.length>240||!color(f.textColor)||!number(f.fontSize,26,58)||!number(f.screenScale,55,94)||!number(f.screenPosition,-60,100)||typeof f.deviceFrame!=='boolean')fail('В старом проекте некорректные настройки.');
      // Retain the original layout until its composition is changed explicitly.
      return {...defaultFrame(f.image,f.sourceName),id:uid(),demo:f.demo,background:f.background,gradient:f.gradient,legacy:{headline:f.headline,subtitle:f.subtitle,fontSize:f.fontSize,screenScale:f.screenScale,screenPosition:f.screenPosition,deviceFrame:f.deviceFrame,textColor:f.textColor},layers:[{...deviceLayer(),deviceFrame:f.deviceFrame},{...textLayer(f.headline,'headline'),fontSize:f.fontSize,color:f.textColor},{...textLayer(f.subtitle,'subtitle'),y:20,fontSize:17,fontWeight:400,lineHeight:1.4,color:f.textColor,opacity:.82}]};
    }
    const layers=validateLayers(f.layers,value.version,false,value.format);
    return {id:uid(),image:f.image,sourceName:f.sourceName,demo:f.demo,background:f.background,gradient:f.gradient,composition:['hero','tilt','focus'].includes(f.composition)?f.composition:'hero',layers};
  });
  const refs=value.references??[];
  if(!Array.isArray(refs)||refs.length>8)fail('В проекте может быть до 8 референсов.');
  const references=refs.map(r=>{if(!r||!validImage(r.image)||typeof r.name!=='string'||r.name.length>200)fail('Не удалось прочитать референс.');return {id:uid(),image:r.image,name:r.name,...(r.recipe===undefined?{}:{recipe:validateReferenceRecipe(r.recipe)})};});
  const saved=value.version>=3?(value.savedPoses??[]):[];
  if(!Array.isArray(saved)||saved.length>12)fail('В проекте может быть до 12 ракурсов.');
  const savedPoses=saved.map(p=>{
    if(!p||typeof p.name!=='string'||p.name.length>60||!number(p.yaw,-180,180)||!number(p.pitch,-180,180)||!number(p.rotation,-180,180)||!number(p.perspective,15,60))fail('В файле некорректный сохранённый ракурс.');
    return {id:uid(),name:p.name,...poseOf(p)};
  });
  const rawPanoramas=value.panoramas??[];
  if(!Array.isArray(rawPanoramas)||rawPanoramas.length>3||(value.version<4&&rawPanoramas.length))fail('В файле некорректные панорамы.');
  const used=new Set();
  if(rawPanoramas.length&&(value.frames.some(f=>typeof f.id!=='string')||new Set(value.frames.map(f=>f.id)).size!==frames.length))fail('В файле повторяются идентификаторы кадров.');
  const panoramas=rawPanoramas.map(p=>{
    if(!p||!Array.isArray(p.frameIds)||p.frameIds.length!==2||!color(p.background)||typeof p.gradient!=='boolean')fail('Не удалось прочитать панораму.');
    const indices=p.frameIds.map(id=>value.frames.findIndex(f=>f.id===id));
    if(indices[0]<0||indices[1]!==indices[0]+1||indices.some(i=>used.has(i)))fail('Панорама должна связывать два соседних кадра без пересечений с другими парами.');
    indices.forEach(i=>used.add(i));
    return {id:uid(),frameIds:indices.map(i=>frames[i].id),background:p.background,gradient:p.gradient,layers:validateLayers(p.layers,value.version,true,value.format)};
  });
  const project={app:'kadr-aso',version:5,name:value.name,format:value.format,exportScale:value.exportScale,exportBothFormats:value.exportBothFormats??false,frames,references,savedPoses,panoramas};
  if(value.localization!==undefined){if(value.version!==7)fail('Локализация требует формат проекта 7.');project.version=7;project.localization=validateLocalization(value.localization,validateSingleProject);}
  return project;
}
export function validateProject(value){
  const project=validateSingleProject(value);
  if(value.version===6||value.version===7&&value.versions!==undefined)return {...project,version:value.version,versions:validateVersionBook(value.versions,validateSingleProject)};
  if(value.versions!==undefined)fail('Версии комплекта требуют формат проекта 6.');
  return project;
}
export class History {
  constructor(limit=40){this.limit=limit;this.past=[];this.future=[];this.group=null;}
  record(project,group=null){if(group&&group===this.group)return;this.past.push(clone(project));if(this.past.length>this.limit)this.past.shift();this.future=[];this.group=group;}
  end(){this.group=null;}
  undo(project){if(!this.past.length)return null;this.future.push(clone(project));this.end();return this.past.pop();}
  redo(project){if(!this.future.length)return null;this.past.push(clone(project));this.end();return this.future.pop();}
  clear(){this.past=[];this.future=[];this.end();}
}
