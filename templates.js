import {clone,uid,textLayer,deviceLayer,cropLayer} from './model.js';
import {enablePhone3D} from './phone-data.js';

const title=(x=8,y=6,width=84,align='left',fontSize=42)=>({x,y,width,align,fontSize});
const note=(x=8,y=20,width=84,align='left')=>({x,y,width,align,fontSize:17});
const phone=(x,y,width,rotation=0,yaw=0,pitch=0)=>({x,y,width,rotation,yaw,pitch});
const detail=(x,y,width,rotation=0,crop={x:5,y:23,w:90,h:23})=>({x,y,width,rotation,crop});
export const SET_TEMPLATES=[
  {id:'utility',name:'Чистая утилита',description:'Крупный интерфейс, светлые кадры и акцент на одной функции.',device:'flat',accent:'#3153f4',ink:'#202b48',paper:'#f1f5ff',slots:[
    {name:'Обложка',tone:'accent',title:title(),note:note(),phone:phone(11,30,78)},
    {name:'Функция крупно',tone:'paper',title:title(8,7,84,'left',38),note:note(8,19),phone:phone(23,29,54),details:[detail(7,61,86)]},
    {name:'Погружение в UI',tone:'white',title:title(8,7,84,'center',40),note:note(10,20,80,'center'),phone:phone(7,32,86)},
    {name:'Сценарий',tone:'paper',title:title(8,9,52,'left',36),note:note(8,30,44),phone:phone(43,38,68,-6)},
    {name:'Экран и вывод',tone:'white',title:title(8,74,84,'center',36),note:note(10,86,80,'center'),phone:phone(21,5,58)},
    {name:'Завершение',tone:'accent',title:title(8,7,84,'center',40),note:note(10,20,80,'center'),phone:phone(20,32,60)}
  ]},
  {id:'cards',name:'Карточки функции',description:'Увеличенные фрагменты UI и чередование верхних и нижних заголовков.',device:'flat',accent:'#743fe0',ink:'#302044',paper:'#f2ebff',slots:[
    {name:'Обложка',tone:'accent',title:title(8,6,84,'center',43),note:note(10,20,80,'center'),phone:phone(15,33,70,5)},
    {name:'Деталь на первом плане',tone:'paper',title:title(8,7,84,'left',39),note:note(8,20),phone:phone(-7,44,83,-7),details:[detail(17,34,76,3)]},
    {name:'Два акцента',tone:'white',title:title(8,7,84,'center',39),note:note(8,20,84,'center'),phone:phone(22,33,56),details:[detail(7,44,86,-3),detail(11,69,78,3,{x:5,y:53,w:90,h:21})]},
    {name:'Действие и подпись',tone:'paper',title:title(8,74,84,'left',36),note:note(8,86),phone:phone(23,4,54,7),details:[detail(6,40,84,-3)]},
    {name:'Ещё одна функция',tone:'white',title:title(8,7,84,'right',40),note:note(12,20,80,'right'),phone:phone(13,32,74,-5),details:[detail(8,61,84,3)]},
    {name:'Завершение',tone:'accent',title:title(8,7,84,'center',42),note:note(10,20,80,'center'),phone:phone(20,31,60),details:[detail(7,63,86)]}
  ]},
  {id:'dimensional',name:'Объёмный герой',description:'iPhone 17 под разными углами, пара устройств и контрастные фоны.',device:'iphone17',accent:'#ceff72',ink:'#171d2b',paper:'#171d2b',slots:[
    {name:'Объёмная обложка',tone:'paper',title:title(8,6,84,'left',43),note:note(),phone:phone(10,33,80,-12,-28,9)},
    {name:'Чистый фронт',tone:'accent',title:title(8,7,84,'center',40),note:note(10,20,80,'center'),phone:phone(21,30,58,0,0,0)},
    {name:'Крупная деталь',tone:'white',title:title(8,7,84,'left',40),note:note(8,20),phone:phone(22,34,70,10,27,-5),details:[detail(6,62,86,-3)]},
    {name:'Два экрана',tone:'paper',title:title(8,7,84,'center',40),note:note(10,20,80,'center'),phone:phone(4,34,55,-10,-25,5),companion:phone(44,47,55,10,25,-4)},
    {name:'Новый ракурс',tone:'accent',title:title(8,74,84,'left',36),note:note(8,86),phone:phone(15,8,65,11,30,6)},
    {name:'Финальный акцент',tone:'paper',title:title(8,7,84,'center',42),note:note(10,20,80,'center'),phone:phone(18,32,65,-6,-18,8)}
  ]}
];

// Shorter sets keep an opening and a closing layout instead of cutting the end.
const SEQUENCES={1:[0],2:[0,5],3:[0,2,5],4:[0,1,3,5],5:[0,1,2,3,5],6:[0,1,2,3,4,5]};
export function templateSlots(id,count){
  const template=SET_TEMPLATES.find(t=>t.id===id);
  if(!template||!SEQUENCES[count])throw new Error('Выбери шаблон и от 1 до 6 кадров.');
  return SEQUENCES[count].map(i=>template.slots[i]);
}
function add(frame,l){
  if(frame.layers.length>=24)throw new Error('В исходном кадре слишком много слоёв для этого шаблона. Освободи место или выбери другой исходник.');
  frame.layers.push(l);return l;
}
function update(l,values){if(!l.locked)Object.assign(l,values);}
function deviceMode(l,mode){
  if(l.locked||mode==='source')return;
  if(mode==='iphone17')enablePhone3D(l);
  else l.deviceModel='flat';
  l.deviceFrame=true;
}
export function buildTemplateVariant(project,id,{sources,device='template',keepColors=false}={}){
  if(project.panoramas?.length)throw new Error('Шаблоны для связанных панорам пока не поддерживаются.');
  if(!Array.isArray(sources)||!sources.length||sources.length>6||sources.some(i=>!Number.isInteger(i)||!project.frames[i]))throw new Error('Назначь исходник каждому кадру.');
  if(!['template','source','flat','iphone17'].includes(device))throw new Error('Выбери модель телефона.');
  const template=SET_TEMPLATES.find(t=>t.id===id),slots=templateSlots(id,sources.length);
  const mode=device==='template'?template.device:device;
  const next=clone(project);next.name=`${project.name} · ${template.name}`.slice(0,64);
  next.frames=sources.map((source,index)=>{
    const frame=clone(project.frames[source]),slot=slots[index];
    frame.id=uid();delete frame.legacy;
    frame.layers=frame.layers.filter(l=>!l.templatePart||l.locked);
    frame.layers.forEach(l=>l.id=uid());
    const heading=frame.layers.find(l=>l.type==='text'&&l.role==='headline')??add(frame,textLayer('Your next big idea','headline'));
    const subtitle=frame.layers.find(l=>l.type==='text'&&l.role==='subtitle');
    let main=frame.layers.find(l=>l.type==='device'&&!l.templatePart);
    if(!main){main=add(frame,deviceLayer());frame.layers.pop();frame.layers.unshift(main);}
    // The newly chosen composition defines a fresh automatic layout. Keep
    // existing corrections on custom and locked objects that it does not edit.
    for(const l of [heading,subtitle,main])if(l&&!l.locked){l.layoutFormat=project.format;l.formatOverrides={};}
    const darkPaper=template.id==='dimensional'&&slot.tone==='paper';
    const background=slot.tone==='accent'?template.accent:slot.tone==='white'?'#ffffff':template.paper;
    const ink=darkPaper?'#ffffff':slot.tone==='accent'&&template.id!=='dimensional'?'#ffffff':template.ink;
    const highlight=ink==='#ffffff'?'#ceff72':template.id==='dimensional'?'#3153f4':template.accent;
    if(!keepColors){frame.background=background;frame.gradient=false;}
    update(heading,{...slot.title,fontFamily:'Arial',fontWeight:800,lineHeight:1.08,rotation:0,...(!keepColors?{color:ink,highlightColor:highlight}:{})});
    if(subtitle)update(subtitle,{...slot.note,fontFamily:'Arial',fontWeight:400,lineHeight:1.35,rotation:0,...(!keepColors?{color:ink}:{})});
    update(main,{...slot.phone,shadow:template.id==='dimensional'?28:22});
    const sourceColor=main.frameColor;deviceMode(main,mode);
    if(keepColors&&!main.locked)main.frameColor=sourceColor;
    if(!keepColors&&!main.locked)main.frameColor=main.deviceModel==='iphone17'?'#ededeb':'#202735';
    // Only generated decorations are replaced on a later application. Custom
    // text, graphics, devices and locked layers stay available in the variant.
    const extra=[];
    for(const d of slot.details??[])extra.push({...cropLayer(),...clone(d),templatePart:'detail',name:'Акцент на UI',border:2,borderColor:'#ffffff'});
    if(slot.companion){
      const src=project.frames[sources[(index+1)%sources.length]],screen=src.layers.find(l=>l.type==='device');
      const other={...clone(main),...slot.companion,id:uid(),locked:false,visible:true,templatePart:'companion',name:'Второй телефон',image:screen?.image??src.image,sourceName:screen?.image?screen.sourceName:src.sourceName};
      // A locked source phone keeps its pose; the new device uses this slot's pose.
      deviceMode(other,mode);extra.push(other);
    }
    for(const l of extra){l.layoutFormat=project.format;l.formatOverrides={};add(frame,l);frame.layers.splice(frame.layers.indexOf(l),1);const at=frame.layers.findIndex(v=>v.type==='text');frame.layers.splice(at<0?frame.layers.length:at,0,l);}
    frame.composition=slot.details?'focus':slot.phone.rotation?'tilt':'hero';
    return frame;
  });
  return next;
}
