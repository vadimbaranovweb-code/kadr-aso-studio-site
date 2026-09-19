import {validatePose,DEFAULT_POSE} from './phone-pose.js';
import {validateBackgroundAsset} from './background.js';
import {validateComposition,cloneComposition} from './composition.js';
import {validateMarks,legacyMarks} from './text-marks.js';
import {ANDROID_DEVICES,IPHONE_DEVICES,DEFAULT_ANDROID_DEVICE} from './devices.js';
export const VERSION='0.12.0';
export const STORES={
  apple:{name:'App Store',width:1320,height:2868,phone:'iPhone',min:1,max:10},
  android:{name:'Android · RuStore / Google Play',width:1080,height:1920,phone:'Android',min:1,max:10}
};
export const APPLE_FORMATS={'440':{width:440,height:956},'414':{width:414,height:896}};
export function formatFor(project){const size=APPLE_FORMATS[project.appleFormat]||APPLE_FORMATS['440'];return project.store==='apple'?{...STORES.apple,width:size.width*3,height:size.height*3,workingWidth:size.width,workingHeight:size.height}:STORES.android;}
export function exportFormats(project){return project.store==='apple'?['440','414'].map(appleFormat=>({...project,appleFormat})): [project];}
const id=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function createProject(){return {app:'kadr-mvp',version:7,name:'Мой комплект',store:'apple',appleFormat:'440',exportScale:3,iphoneDevice:'iphone-17-pro',phoneAlignment:'shared',phoneScale:1,phoneY:0,textColor:null,textOpacity:1,locale:'source',androidDevice:DEFAULT_ANDROID_DEVICE,frame:'device',deviceColor:null,layout:'full',cropScale:.84,cropRaise:0,subtitleEnabled:true,background:{asset:null,mode:'solid',angle:20,colors:['#F4F5F7','#DCE6F0'],opacities:[1,1]},slides:[]};}
export const EXAMPLE_COPY=[
 ['Самое важное — рядом','Откройте новый взгляд на привычные вещи'],
 ['Больше возможностей','Всё, что нужно, в одном приложении'],
 ['Начните с простого','Сделайте первый шаг уже сегодня'],
 ['Ваш день. Ваш ритм.','Найдите то, что подходит именно вам']
];
export function createSlide(image,name,width,height,index=0){const [title,subtitle]=EXAMPLE_COPY[index%EXAMPLE_COPY.length];return {id:id(),image,name:String(name).slice(0,150),width,height,title,subtitle,titleSize:34,subtitleSize:17,titleExample:true,subtitleExample:true,screenFit:'cover',screenScale:1,screenX:0,screenY:0,titleHighlight:'',subtitleHighlight:'',titleHighlightColor:'#2563EB',subtitleHighlightColor:'#2563EB',titleMarks:[],subtitleMarks:[],composition:null,contentOrder:'text-top',phonePose:{...DEFAULT_POSE},screens:{},copies:{}};}
const number=(value,fallback,min,max)=>{if(value===undefined)return fallback;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error('В проекте повреждены размеры или положение элементов.');return value;};
export const hasExamples=p=>p.slides.some(s=>(s.titleExample&&s.title)||(p.subtitleEnabled&&s.subtitleExample&&s.subtitle));
export const storeHint=p=>p.store==='android'&&(p.slides.length<2||p.slides.length>8)?'Для Google Play выберите 2–8 изображений из комплекта. RuStore принимает 1–10.':'';
export function validateProject(value){
  if(value?.app==='kadr-aso')throw Object.assign(new Error('Это проект прежнего редактора. Откройте его в предыдущей версии: все слои и локализации сохранятся.'),{name:'LegacyProjectError'});
  if(value?.app!=='kadr-mvp'||![1,2,3,4,5,6,7].includes(value.version))throw new Error('Этот формат проекта не поддерживается. Выберите файл проекта Скринпака или Кадра MVP.');
  const store=value.version===1&&['rustore','google'].includes(value.store)?'android':value.store;
  if(!Object.hasOwn(STORES,store)||!['device','outline','none'].includes(value.frame)||!['full','crop'].includes(value.layout))throw new Error('В проекте повреждены настройки оформления.');
  const androidDevice=value.androidDevice===undefined?'android-generic':value.androidDevice;
  if(typeof androidDevice!=='string'||!Object.hasOwn(ANDROID_DEVICES,androidDevice))throw new Error('Эта модель телефона не поддерживается.');
  if(!Array.isArray(value.slides)||value.slides.length>10)throw new Error('В комплекте может быть не больше 10 экранов.');
  const bg=value.background;
  if(!bg||!['solid','gradient','image'].includes(bg.mode)||!Array.isArray(bg.colors)||bg.colors.length!==2||bg.colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw new Error('В проекте повреждён цвет фона.');
  if(value.deviceColor!=null&&!/^#[0-9a-f]{6}$/i.test(value.deviceColor))throw new Error('Повреждён цвет корпуса.');
  const iphoneDevice=value.iphoneDevice??'iphone-generic';
  if(!Object.hasOwn(IPHONE_DEVICES,iphoneDevice))throw new Error('Эта модель iPhone не поддерживается.');
  if(value.appleFormat!==undefined&&!Object.hasOwn(APPLE_FORMATS,value.appleFormat))throw new Error('Неизвестный формат App Store.');
  if(value.locale!==undefined&&!Object.hasOwn(LOCALES,value.locale))throw new Error('Неизвестный язык.');
  if(value.exportScale!==undefined&&![1,3].includes(value.exportScale))throw new Error('Экспорт поддерживает 1× или 3×.');
  if(value.phoneAlignment!==undefined&&!['shared','text'].includes(value.phoneAlignment))throw new Error('Некорректное выравнивание телефонов.');
  const ids=new Set();let bytes=0;
  const imageBytes=image=>{bytes+=image.length;if(bytes>180*1024*1024)throw new Error('Проект слишком большой: максимум 180 МБ изображений.');};
  const backgroundAsset=validateBackgroundAsset(bg.asset,imageBytes);
  if(bg.mode==='image'&&!backgroundAsset)throw new Error('Изображение фона отсутствует.');
  const slides=value.slides.map(s=>{
    if(s?.contentOrder!==undefined&&!['text-top','text-bottom'].includes(s.contentOrder))throw new Error('Повреждён порядок блоков.');
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id))throw new Error('В проекте повреждён список экранов.');ids.add(s.id);
    if(typeof s.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s.image)||s.image.length>30*1024*1024)throw new Error('В проекте повреждено изображение.');
    imageBytes(s.image);
    if(!Number.isFinite(s.width)||!Number.isFinite(s.height)||s.width<1||s.height<=s.width||s.width*s.height>32e6)throw new Error('Нужны вертикальные скриншоты до 32 мегапикселей.');
    if(typeof s.title!=='string'||s.title.length>90||typeof s.subtitle!=='string'||s.subtitle.length>160)throw new Error('Текст слишком длинный: заголовок до 90, подзаголовок до 160 символов.');
    return {id:s.id,image:s.image,name:String(s.name||'Экран').slice(0,150),width:s.width,height:s.height,title:s.title,subtitle:s.subtitle,titleSize:number(s.titleSize,34,18,56),subtitleSize:number(s.subtitleSize,17,12,28),titleExample:s.titleExample===true,subtitleExample:s.subtitleExample===true,screenFit:screenFit(s.screenFit),screenScale:number(s.screenScale,1,1,3),screenX:number(s.screenX,0,-1,1),screenY:number(s.screenY,0,-1,1),composition:validateComposition(s.composition),contentOrder:s.contentOrder??'text-top',phonePose:validatePose(s.phonePose),...validateCopyDecoration(s),copies:validateCopies(s.copies),screens:validateScreens(s.screens,imageBytes)};
  });
  return {app:'kadr-mvp',version:7,appleFormat:value.appleFormat??'440',exportScale:number(value.exportScale,3,1,3),iphoneDevice,phoneAlignment:value.phoneAlignment??'text',phoneScale:value.phoneScale==null?null:number(value.phoneScale,1,.6,1.8),phoneY:number(value.phoneY,0,-.2,.3),textColor:color(value.textColor,null),textOpacity:number(value.textOpacity,1,0,1),locale:value.locale??'source',name:String(value.name||'Мой комплект').slice(0,80),store,androidDevice,frame:value.frame,deviceColor:value.deviceColor??null,layout:value.layout,cropScale:number(value.cropScale,1,.6,1.05),cropRaise:number(value.cropRaise,0,0,.2),subtitleEnabled:value.subtitleEnabled!==false,background:{asset:backgroundAsset,mode:bg.mode,angle:bg.angle===null||bg.angle===undefined?null:number(bg.angle,20,0,360),colors:[...bg.colors],opacities:validateOpacities(bg.opacities)},slides};
}
export function moveSlide(project,from,to){if(from===to||from<0||to<0||from>=project.slides.length||to>=project.slides.length)return false;const [slide]=project.slides.splice(from,1);project.slides.splice(to,0,slide);return true;}
export function exportIssues(project){
  const store=STORES[project.store],issues=[];
  if(project.slides.length<store.min)issues.push(`Для ${store.name} добавьте минимум ${store.min} ${store.min===1?'экран':'экрана'}.`);
  if(project.slides.length>store.max)issues.push(`В ${store.name} можно загрузить до ${store.max} экранов. Удалите лишние или выберите другой магазин.`);
  return issues;
}
export function slug(name){return String(name).normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\.+/g,'-').trim().slice(0,70)||'kadr';}

export const LOCALES={source:'Оригинал',en:'English',ru:'Русский',de:'Deutsch',fr:'Français',es:'Español',pt:'Português',ja:'日本語',ko:'한국어',zh:'简体中文',tr:'Türkçe'};
function color(v,fallback){if(v==null)return fallback;if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw new Error('Некорректный цвет.');return v;}
function screenFit(v){if(v===undefined)return 'contain';if(!['cover','contain'].includes(v))throw new Error('Некорректное заполнение экрана.');return v;}
function validateOpacities(v){if(v===undefined)return [1,1];if(!Array.isArray(v)||v.length!==2)throw new Error('Некорректная прозрачность фона.');return v.map(n=>number(n,1,0,1));}
function validateCopyDecoration(s){const out={};for(const field of ['title','subtitle']){const h=s[field+'Highlight']??'';if(typeof h!=='string'||h.length>160)throw new Error('Некорректное выделение текста.');out[field+'Highlight']=h;out[field+'HighlightColor']=color(s[field+'HighlightColor'],'#2563EB');out[field+'Marks']=s[field+'Marks']===undefined?legacyMarks(s[field],h,out[field+'HighlightColor']):validateMarks(s[field+'Marks'],s[field]);}return out;}
const COPY_KEYS=['title','subtitle','titleExample','subtitleExample','titleHighlight','subtitleHighlight','titleHighlightColor','subtitleHighlightColor','titleMarks','subtitleMarks'];
export function copyOf(s){return Object.fromEntries(COPY_KEYS.map(k=>[k,Array.isArray(s[k])?s[k].map(m=>({...m})):s[k]]));}
function validateCopies(copies){if(copies===undefined)return {};if(!copies||typeof copies!=='object'||Array.isArray(copies)||Object.keys(copies).length>Object.keys(LOCALES).length)throw new Error('Повреждены языковые версии.');const out={};for(const [locale,c] of Object.entries(copies)){if(!Object.hasOwn(LOCALES,locale)||!c||typeof c.title!=='string'||c.title.length>90||typeof c.subtitle!=='string'||c.subtitle.length>160)throw new Error('Повреждены тексты языковой версии.');out[locale]={title:c.title,subtitle:c.subtitle,titleExample:c.titleExample===true,subtitleExample:c.subtitleExample===true,...validateCopyDecoration(c)};}return out;}
export function switchLocale(project,locale){if(!Object.hasOwn(LOCALES,locale))throw new Error('Неизвестный язык.');if(locale===project.locale)return;for(const s of project.slides){s.copies[project.locale]=copyOf(s);Object.assign(s,copyOf(s.copies[locale]||s.copies.source||s));}project.locale=locale;}
export function applyCopy(project,locale,rows){if(rows.length!==project.slides.length||rows.some((r,i)=>r.id!==project.slides[i].id))throw new Error('Состав комплекта изменился. Сгенерируйте тексты заново.');switchLocale(project,locale);for(const [i,s] of project.slides.entries()){Object.assign(s,{title:rows[i].title,subtitle:rows[i].subtitle,titleExample:false,subtitleExample:false,titleHighlight:'',subtitleHighlight:'',titleMarks:[],subtitleMarks:[]});s.copies[locale]=copyOf(s);}}

// Copy mutable settings/copybooks while sharing immutable image strings across undo entries.
export function cloneProject(p){return {...p,background:{...p.background,asset:p.background.asset?{...p.background.asset}:null,colors:[...p.background.colors],opacities:[...(p.background.opacities||[1,1])]},slides:p.slides.map(s=>({...s,...copyOf(s),composition:cloneComposition(s.composition),phonePose:{...DEFAULT_POSE,...s.phonePose},screens:Object.fromEntries(Object.entries(s.screens||{}).map(([locale,screen])=>[locale,{...screen}])),copies:Object.fromEntries(Object.entries(s.copies||{}).map(([locale,copy])=>[locale,copyOf(copy)]))}))};}

function validateScreens(screens,accountBytes){
 if(screens===undefined)return {};
 if(!screens||typeof screens!=='object'||Array.isArray(screens)||Object.keys(screens).length>10)throw new Error('Повреждены изображения языковых версий.');
 const out={};
 for(const [locale,s] of Object.entries(screens)){
  if(locale==='source'||!Object.hasOwn(LOCALES,locale)||!s||typeof s.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s.image)||s.image.length>30*1024*1024)throw new Error('Повреждено локализованное изображение.');
  if(!Number.isInteger(s.width)||!Number.isInteger(s.height)||s.width<1||s.height<=s.width||s.width*s.height>32e6)throw new Error('Повреждены размеры локализованного изображения.');
  accountBytes(s.image);
  out[locale]={image:s.image,width:s.width,height:s.height,name:String(s.name||'Перевод интерфейса').slice(0,150),screenFit:screenFit(s.screenFit),screenScale:number(s.screenScale,1,1,3),screenX:number(s.screenX,0,-1,1),screenY:number(s.screenY,0,-1,1)};
 }
 return out;
}
