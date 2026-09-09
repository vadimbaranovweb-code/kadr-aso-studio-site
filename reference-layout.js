import {clone,deviceLayer,cropLayer,FORMATS,clamp} from './model.js';
import {validateReferenceRecipe,readableInk} from './reference-data.js';
import {panoramaFor,panoramaScene,frameUnits} from './panorama.js';
import {layerRect,corners,bounds} from './geometry-2d.js';
import {layerImage,resolveLayer} from './layout.js';
import {isPhone3D,enablePhone3D} from './phone-data.js';
import {phoneProjection} from './phone-geometry.js';
import {referenceRoles,referenceRoleLayout,REFERENCE_ROLES} from './reference-sequence.js';

export const REFERENCE_VARIANTS=[
  {id:'match',name:'По разметке',description:'Выбранные области и палитра референса.'},
  {id:'focus',name:'Акцент на интерфейсе',description:'Крупнее телефон, спокойный светлый фон.'},
  {id:'angle',name:'Диагональ',description:'Выразительный ракурс и тёмный фон.'}
];
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
function palette(recipe,variant){
  const background=variant==='focus'?mix(recipe.background,'#ffffff',.92):variant==='angle'?mix(recipe.background,'#101827',.82):recipe.background;
  return {background,ink:variant==='match'?recipe.ink:readableInk(background),accent:recipe.accent};
}
function resetLayout(l,format){l.layoutFormat=format;l.formatOverrides={};l.resizeAnchor='auto';}
function placeText(scene,side,recipe,colors,format,images,ctx,warnings,sharedStyle){
  const eligible=scene.layers.filter(l=>l.type==='text'&&(scene.columns!==2||l.sourceSide===side));
  const title=eligible.find(l=>l.role==='headline'),subtitle=eligible.find(l=>l.role==='subtitle');
  if(!title&&!subtitle){warnings.push('В исходнике нет заголовка или подзаголовка: новые тексты не добавлены.');return;}
  const [w,h]=FORMATS[format],zone=recipe.title,gap=7*w/414;
  const editable=[title,subtitle].filter(l=>l&&!l.locked);
  for(const l of editable){
    resetLayout(l,format);Object.assign(l,{x:zone.x+side*100,y:zone.y,width:zone.w,rotation:0,align:recipe.align});
    if(recipe.font!=='source')l.fontFamily=recipe.font;
    else if(sharedStyle)l.fontFamily=sharedStyle[l===title?'headline':'subtitle'].fontFamily;
    if(sharedStyle)l.fontWeight=sharedStyle[l===title?'headline':'subtitle'].fontWeight;
    if(recipe.useColors){l.color=colors.ink;l.highlightColor=colors.accent;}
    l.fontSize=l===title?(recipe.role==='side'?36:recipe.role==='closing'?42:44):17;l.lineHeight=l===title?1.1:1.35;
  }
  const measure=l=>l&&l.visible&&l.text.trim()?layerRect(l.locked?resolveLayer(l,scene,images,format,ctx):l,layerImage(scene,l,images),w,h,ctx).h:0;
  let total=0;
  for(let i=0;i<34;i++){
    const ht=measure(title),hs=measure(subtitle);total=ht+hs+(ht&&hs?gap:0);
    if(total<=zone.h*h/100)break;
    let changed=false;for(const l of editable){const floor=l===title?20:12;if(l.fontSize>floor){l.fontSize--;changed=true;}}
    if(!changed)break;
  }
  if(subtitle&&!subtitle.locked){const ht=measure(title);subtitle.y=clamp(zone.y+(ht+(ht&&measure(subtitle)?gap:0))/h*100,-200,200);}
  if(total>zone.h*h/100+.5)warnings.push('Текст не помещается в отмеченную область. Увеличь её или поправь текст после применения.');
}
function placePhone(scene,side,recipe,variant,format,images,ctx,sharedStyle){
  let phone=scene.layers.find(l=>l.type==='device'&&l.templatePart!=='companion'&&(scene.columns!==2||l.sourceSide===side));
  if(!phone){
    if(scene.layers.length>=(scene.columns===2?48:24))throw new Error('Для телефона не хватает места среди слоёв. Удали лишний слой в исходнике.');
    phone=deviceLayer();if(scene.columns===2)phone.sourceSide=side;scene.layers.unshift(phone);
  }
  if(phone.locked)return;
  const img=layerImage(scene,phone,images);if(!img)throw new Error('Не удалось загрузить исходный UI телефона.');
  resetLayout(phone,format);
  if(recipe.device==='iphone17')enablePhone3D(phone);else if(recipe.device==='flat')phone.deviceModel='flat';
  const pose=recipe.pose??{rotation:recipe.rotation,yaw:0,pitch:0};
  const front=recipe.role==='closing';
  Object.assign(phone,{rotation:clamp(pose.rotation+(front?0:variant==='angle'?-11:variant==='focus'?3:0),-45,45),yaw:front?0:clamp(pose.yaw+(variant==='angle'?-27:0),-35,35),pitch:front?0:clamp(pose.pitch+(variant==='angle'?8:0),-20,20)});
  if(sharedStyle)phone.frameColor=sharedStyle.frameColor;
  const [w,h]=FORMATS[format],zone={...recipe.phone};
  if(variant==='focus'&&!recipe.role){zone.x=Math.max(2,zone.x-4);zone.w=Math.min(98-zone.x,zone.w+8);zone.h=Math.min(100-zone.y,zone.h+3);}
  const r=layerRect({...phone,x:0,y:0,width:10000/w},img,w,h,ctx),projected=isPhone3D(phone)?phoneProjection(phone,r).bounds:bounds(corners(r,phone));
  const factor=Math.min(zone.w*w/100/projected.w,zone.h*h/100/projected.h)*(variant==='focus'&&!recipe.role?1.06:1);
  phone.width=clamp(100*factor/w*100,2,250);
  const actual=layerRect({...phone,x:0,y:0},img,w,h,ctx),b=isPhone3D(phone)?phoneProjection(phone,actual).bounds:bounds(corners(actual,phone));
  const x=(zone.x+side*100)*w/100+(zone.w*w/100-b.w)/2-b.x,y=zone.y*h/100+(zone.h*h/100-b.h)/2-b.y;
  phone.x=clamp(x/w*100,-200,scene.columns===2?300:200);phone.y=clamp(y/h*100,-200,200);
}
function placeDetail(scene,side,recipe,format,images,ctx,warnings){
  if(!recipe.detail)return;
  if(scene.layers.some(l=>l.referencePart==='detail'&&l.locked&&(scene.columns!==2||l.sourceSide===side))){warnings.push('Заблокированная вырезка сохранена; новая деталь не добавлена.');return;}
  if(scene.layers.length>=(scene.columns===2?48:24))throw new Error('Для крупной детали нужен свободный слой. Выбери другую композицию или освободи место.');
  const l={...cropLayer(),referencePart:'detail',name:'Деталь UI · выбери область',shadow:16};
  if(scene.columns===2)l.sourceSide=side;
  resetLayout(l,format);
  const [w,h]=FORMATS[format],zone=recipe.detail,img=layerImage(scene,l,images);
  if(!img)throw new Error('Не удалось загрузить UI для крупной детали.');
  l.width=zone.w;l.x=zone.x+side*100;l.y=zone.y;
  const r=layerRect(l,img,w,h,ctx);
  if(r.h>zone.h*h/100){l.width*=zone.h*h/100/r.h;l.x+=(zone.w-l.width)/2;}
  const at=scene.layers.findIndex(v=>v.type==='text');scene.layers.splice(at<0?scene.layers.length:at,0,l);
  warnings.push('Крупная деталь использует общий UI кадра. Выбери нужную область в Pro.');
}
export function buildReferenceVariant(project,{referenceId,recipe,variant='match',scope='current',active=0},images,ctx){
  const config=validateReferenceRecipe(recipe);
  if(!REFERENCE_VARIANTS.some(v=>v.id===variant)||!['current','set'].includes(scope)||!Number.isInteger(active)||!project.frames[active])throw new Error('Выбери область применения оформления.');
  const next=clone(project),reference=next.references.find(r=>r.id===referenceId);
  if(!reference)throw new Error('Прикрепи референс к проекту.');
  reference.recipe=config;
  const activeId=next.frames[active].id,selectedPair=panoramaFor(next,activeId),selectedId=selectedPair?.id??activeId;
  const units=frameUnits(next).filter(u=>scope==='set'||(u.panorama?.id??u.frames[0].id)===selectedId),warnings=[],previewIds=[],compositions=[];
  const colors=palette(config,variant),story=scope==='set'&&config.setLayout==='story',roles=referenceRoles(next.frames.length,config.roles);
  const seed=selectedPair?panoramaScene(next,selectedPair):next.frames[active];
  const textStyle=role=>{const layer=seed.layers.find(l=>l.role===role);return {fontFamily:layer?.fontFamily??'Arial',fontWeight:layer?.fontWeight??(role==='headline'?700:400)};};
  const sharedStyle=story?{headline:textStyle('headline'),subtitle:textStyle('subtitle'),frameColor:seed.layers.find(l=>l.type==='device')?.frameColor??'#171923'}:null;
  for(const unit of units){
    const target=unit.panorama??unit.frames[0];
    // Replace only this feature's unlocked generated details. Custom graphics,
    // template layers and locked objects keep their content and corrections.
    delete target.legacy;
    target.layers=target.layers.filter(l=>l.referencePart!=='detail'||l.locked);
    const scene=unit.panorama?panoramaScene(next,target):target;
    if(config.useColors){target.background=colors.background;target.gradient=false;scene.background=colors.background;scene.gradient=false;}
    if(scene.layers.some(l=>l.locked))warnings.push('Заблокированные слои сохранены. Проверь их сочетание с новым оформлением.');
    if(scene.layers.some(l=>(l.type==='image'||l.type==='crop')&&l.visible))warnings.push('Дополнительная графика сохранена. Проверь её положение в новой композиции.');
    for(let side=0;side<(unit.panorama?2:1);side++){
      const frame=unit.frames[side],index=next.frames.indexOf(frame),role=story?roles[index]:'reference';
      const layout=story?referenceRoleLayout(config,role):config;
      placeText(scene,side,layout,colors,next.format,images,ctx,warnings,sharedStyle);
      placePhone(scene,side,layout,variant,next.format,images,ctx,sharedStyle);
      placeDetail(scene,side,layout,next.format,images,ctx,warnings);
      compositions.push({frameId:frame.id,index,role,name:REFERENCE_ROLES.find(v=>v.id===role).name});
      if(!unit.panorama)target.composition=role==='detail'?'focus':['angled','side','bottom'].includes(role)?'tilt':'hero';
    }
    if(unit.panorama)warnings.push('Панорама сохранена общим холстом. Проверь объекты на стыке кадров.');
    previewIds.push(...unit.frames.map(f=>f.id));
  }
  next.name=`${project.name} · ${REFERENCE_VARIANTS.find(v=>v.id===variant).name}`.slice(0,64);
  return {project:next,previewIds,compositions,warnings:[...new Set(warnings)]};
}
