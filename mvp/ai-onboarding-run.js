import {cloneProject,copyOf,formatFor,switchLocale,validateProject} from './model.js';
import {withCopies} from './pack-plan.js';
import {deviceFor} from './devices.js';
import {requestCopy} from './ai-copy.js';
import {requestReference,applyReference} from './ai-reference.js';
import {requestBackground} from './ai-background.js';

// One explicit run, one draft, one commit. No automatic retries or partial results.
export async function generateOnboardingPack({project,key,copy,reference,artwork=false,locale='en',references=[],signal,assertCurrent=()=>{},onProgress=()=>{}},services){
 const {prepareSlides,decodeBackground,copyRequest=requestCopy,referenceRequest=requestReference,backgroundRequest=requestBackground}=services;
 const snapshot=cloneProject(project);
 const guard=()=>{if(signal?.aborted)throw new Error('Сборка отменена.');assertCurrent();};
 guard();
 if(!copy&&!reference)return snapshot;
 if(!key?.trim())throw new Error('Подключите ключ для выбранных действий.');
 if(!snapshot.slides.length)throw new Error('Сначала добавьте экраны приложения.');
 if(reference&&(!references.length||references.length>6))throw new Error('Добавьте от 1 до 6 референсов.');
 onProgress('prepare');const slides=await prepareSlides(snapshot);guard();
 const target=snapshot.locale==='source'?'source':locale;
 let draft;
 if(reference){
  onProgress(copy?'reference-copy':'reference');
  const plan=await referenceRequest({key,slides,references,locale,subtitleEnabled:snapshot.subtitleEnabled,canvasHeight:440*formatFor(snapshot).height/formatFor(snapshot).width,deviceRatio:deviceFor(snapshot).ratio,signal});guard();
  const base=cloneProject(snapshot);if(copy)switchLocale(base,target);
  draft=applyReference(base,plan);
  if(!copy)for(const [i,s] of draft.slides.entries()){Object.assign(s,copyOf(snapshot.slides[i]));s.copies[draft.locale]=copyOf(s);}
  if(artwork){
   onProgress('artwork');const data=await backgroundRequest({key,prompt:plan.backgroundPrompt,quality:'xhigh',references,signal});guard();
   const asset=await decodeBackground(data);guard();draft.background={...draft.background,mode:'image',asset};
  }
 }else{
  onProgress('copy');const rows=await copyRequest({key,slides,locale,mode:'generate',signal});guard();
  draft=withCopies(snapshot,[[target,rows]],{activate:target});
 }
 onProgress('finish');draft=validateProject(draft);guard();return draft;
}
