import {LOCALES,switchLocale,copyOf,validateProject,hasExamples} from './model.js';
import {withCopies} from './pack-plan.js';
import {screenFor,putScreen} from './screen-assets.js';
import {requestCopy} from './ai-copy.js';
import {requestImageEdit,imageEditSize} from './ai-images.js';

export function localizationPlan(project,{locales,texts=true,interfaces=false}={}){
 const targets=[...new Set(locales||[])];
 if(!targets.length||targets.some(l=>l==='source'||l===project.locale||!Object.hasOwn(LOCALES,l)))throw new Error('Выберите языки, отличные от текущего.');
 if(!project.slides.length)throw new Error('Сначала добавьте экраны.');
 if(!texts&&!interfaces)throw new Error('Выберите, что переводить.');
 if(texts&&hasExamples(project))throw new Error('Замените тексты-примеры перед переводом заголовков.');
 if(interfaces)for(const s of project.slides){const a=screenFor(s,project.locale);imageEditSize(a.width,a.height);}
 return {locales:targets,texts:Boolean(texts),interfaces:Boolean(interfaces),textRequests:texts?targets.length:0,imageRequests:interfaces?targets.length*project.slides.length:0};
}
// Each request starts only after the previous one completed. No partial apply/retry.
export async function requestLocalization({project,plan,key,signal,onProgress=()=>{},prepareImage,decodeImage,fetchImpl}){
 const checked=localizationPlan(project,plan),result={entries:[],screens:[]};
 const total=checked.textRequests+checked.imageRequests;let done=0;
 const cancelled=()=>{if(signal?.aborted)throw new Error('Перевод отменён.');};
 for(const locale of checked.locales){
  if(checked.texts){cancelled();onProgress(++done,total,`${LOCALES[locale]} · тексты`);const rows=await requestCopy({key,slides:project.slides,locale,mode:'localize',signal,transport:fetchImpl||globalThis.fetch});cancelled();result.entries.push([locale,rows]);}
  if(checked.interfaces)for(const [index,slide] of project.slides.entries()){
   cancelled();onProgress(++done,total,`${LOCALES[locale]} · интерфейс ${index+1}`);
   const source=screenFor(slide,project.locale),prepared=await prepareImage(source);cancelled();
   const image=await requestImageEdit({key,slide:prepared,locale,quality:plan.quality||'high',signal,fetchImpl});cancelled();
   const asset=await decodeImage(image,source);cancelled();
   result.screens.push({id:slide.id,locale,asset,selected:true});
  }
 }
 return result;
}
export function withLocalization(project,result,{activate=project.locale}={}){
 const next=withCopies(project,result.entries,{activate:project.locale});
 for(const row of result.screens){
  if(row.selected===false)continue;
  if(row.locale==='source'||!Object.hasOwn(LOCALES,row.locale))throw new Error('Неизвестный язык интерфейса.');
  const slide=next.slides.find(s=>s.id===row.id);if(!slide)throw new Error('Состав комплекта изменился.');
  // Image-only translation preserves existing copy or explicitly copies the basis.
  if(row.locale!==next.locale&&!slide.copies[row.locale])slide.copies[row.locale]=copyOf(slide);
  putScreen(slide,row.locale,row.asset);
 }
 // An image-only request also creates copybooks for slides excluded at review.
 const imageLocales=new Set(result.screens.filter(r=>r.selected!==false).map(r=>r.locale));
 for(const locale of imageLocales)for(const s of next.slides)if(locale!==next.locale&&!s.copies[locale])s.copies[locale]=copyOf(s);
 const produced=new Set([...result.entries.map(([l])=>l),...imageLocales]);
 if(activate!==project.locale&&!produced.has(activate))activate=produced.values().next().value||project.locale;
 switchLocale(next,activate);return validateProject(next);
}
