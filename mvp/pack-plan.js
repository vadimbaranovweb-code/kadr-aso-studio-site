import {LOCALES,APPLE_FORMATS,cloneProject,switchLocale,applyCopy,exportFormats} from './model.js';
export function hasLocale(project,locale){return Object.hasOwn(LOCALES,locale)&&project.slides.every(s=>project.locale===locale||Boolean(s.copies?.[locale]));}
export function availableLocales(project){return Object.keys(LOCALES).filter(locale=>hasLocale(project,locale));}
export function packVariants(project,locales){
 const chosen=[...new Set(locales)];if(!chosen.length)throw new Error('Выберите хотя бы один язык.');
 return chosen.flatMap(locale=>{if(!hasLocale(project,locale))throw new Error(`Сначала подготовьте перевод: ${LOCALES[locale]||locale}.`);const copy=cloneProject(project);switchLocale(copy,locale);return exportFormats(copy);});
}
export function packEntries(project,locales){return packVariants(project,locales).flatMap(variant=>variant.slides.map((slide,index)=>({variant,slide,index,name:`${variant.locale}/${variant.store==='apple'?APPLE_FORMATS[variant.appleFormat].width*variant.exportScale+'x'+APPLE_FORMATS[variant.appleFormat].height*variant.exportScale:'1080x1920'}/${String(index+1).padStart(2,'0')}.png`})));}
// Build the entire result first: a malformed later language cannot partially apply.
export function withCopies(project,entries,{activate=project.locale}={}){
 const next=cloneProject(project);
 for(const [locale,rows] of entries)applyCopy(next,locale,rows);
 switchLocale(next,activate);return next;
}
