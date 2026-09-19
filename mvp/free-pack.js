import {APPLE_FORMATS,cloneProject,exportFormats} from './model.js';
// Export only what the editor displays. Imported archived locales stay in the
// portable document; no locale switching or translation runs during export.
export function freePackEntries(project){
 return exportFormats(cloneProject(project)).flatMap(variant=>variant.slides.map((slide,index)=>({
  variant,slide,index,name:`${variant.store==='apple'?APPLE_FORMATS[variant.appleFormat].width*variant.exportScale+'x'+APPLE_FORMATS[variant.appleFormat].height*variant.exportScale:'1080x1920'}/${String(index+1).padStart(2,'0')}.png`
 })));
}
