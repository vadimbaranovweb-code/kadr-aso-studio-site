import {ANDROID_DEVICES,DEFAULT_ANDROID_DEVICE} from './devices.js';
export const VERSION='0.2.0';
export const STORES={
  rustore:{name:'RuStore',width:1080,height:1920,phone:'Android',min:1,max:10},
  google:{name:'Google Play',width:1080,height:1920,phone:'Android',min:2,max:8},
  apple:{name:'App Store',width:1320,height:2868,phone:'iPhone',min:1,max:10}
};
export const PALETTES=[
  {name:'Облако',colors:['#EDF4FF','#D8F3F5']},
  {name:'Белый',colors:['#FFFFFF','#FFFFFF']},
  {name:'Океан',colors:['#103461','#1765D6']},
  {name:'Графит',colors:['#16202C','#364555']},
  {name:'Мята',colors:['#C8F7DB','#99DDEC']},
  {name:'Персик',colors:['#FFE5B4','#FFC4AE']}
];
const id=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createProject(){return {app:'kadr-mvp',version:1,name:'Мой комплект',store:'rustore',androidDevice:DEFAULT_ANDROID_DEVICE,frame:'device',layout:'full',subtitleEnabled:true,background:{mode:'gradient',colors:[...PALETTES[0].colors]},slides:[]};}
export function createSlide(image,name,width,height){return {id:id(),image,name:String(name).slice(0,150),width,height,title:'',subtitle:''};}
export function validateProject(value){
  if(value?.app==='kadr-aso')throw Object.assign(new Error('Это проект прежнего редактора. Откройте его в предыдущей версии: все слои и локализации сохранятся.'),{name:'LegacyProjectError'});
  if(value?.app!=='kadr-mvp'||value.version!==1)throw new Error('Этот формат проекта не поддерживается. Выберите файл Кадра MVP.');
  if(!Object.hasOwn(STORES,value.store)||!['device','outline','none'].includes(value.frame)||!['full','crop'].includes(value.layout))throw new Error('В проекте повреждены настройки оформления.');
  const androidDevice=value.androidDevice===undefined?'android-generic':value.androidDevice;
  if(typeof androidDevice!=='string'||!Object.hasOwn(ANDROID_DEVICES,androidDevice))throw new Error('Эта модель телефона не поддерживается.');
  if(!Array.isArray(value.slides)||value.slides.length>10)throw new Error('В комплекте может быть не больше 10 экранов.');
  const bg=value.background;
  if(!bg||!['solid','gradient'].includes(bg.mode)||!Array.isArray(bg.colors)||bg.colors.length!==2||bg.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('В проекте повреждён цвет фона.');
  const ids=new Set();let bytes=0;
  const slides=value.slides.map(s=>{
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id))throw new Error('В проекте повреждён список экранов.');ids.add(s.id);
    if(typeof s.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s.image)||s.image.length>30*1024*1024)throw new Error('В проекте повреждено изображение.');
    bytes+=s.image.length;if(bytes>180*1024*1024)throw new Error('Проект слишком большой: максимум 180 МБ изображений.');
    if(!Number.isFinite(s.width)||!Number.isFinite(s.height)||s.width<1||s.height<=s.width||s.width*s.height>32e6)throw new Error('Нужны вертикальные скриншоты до 32 мегапикселей.');
    if(typeof s.title!=='string'||s.title.length>90||typeof s.subtitle!=='string'||s.subtitle.length>160)throw new Error('Текст слишком длинный: заголовок до 90, подзаголовок до 160 символов.');
    return {id:s.id,image:s.image,name:String(s.name||'Экран').slice(0,150),width:s.width,height:s.height,title:s.title,subtitle:s.subtitle};
  });
  return {app:'kadr-mvp',version:1,name:String(value.name||'Мой комплект').slice(0,80),store:value.store,androidDevice,frame:value.frame,layout:value.layout,subtitleEnabled:value.subtitleEnabled!==false,background:{mode:bg.mode,colors:[...bg.colors]},slides};
}
export function moveSlide(project,from,to){if(from===to||from<0||to<0||from>=project.slides.length||to>=project.slides.length)return false;const [slide]=project.slides.splice(from,1);project.slides.splice(to,0,slide);return true;}
export function exportIssues(project){
  const store=STORES[project.store],issues=[];
  if(project.slides.length<store.min)issues.push(`Для ${store.name} добавьте минимум ${store.min} ${store.min===1?'экран':'экрана'}.`);
  if(project.slides.length>store.max)issues.push(`В ${store.name} можно загрузить до ${store.max} экранов. Удалите лишние или выберите другой магазин.`);
  return issues;
}
export function slug(name){return String(name).normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\.+/g,'-').trim().slice(0,70)||'kadr';}
