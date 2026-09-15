// Originals stay on the slide; localized images are independent overrides.
export function screenFor(slide, locale='source') {
  return locale==='source' || !slide.screens?.[locale] ? slide : {...slide,...slide.screens[locale]};
}
export function screenSettings(slide, locale) {
  return locale!=='source' && slide.screens?.[locale] ? slide.screens[locale] : slide;
}
export function screenAssets(project) {
  return [...project.slides.flatMap(s=>[s,...Object.values(s.screens||{})]),...(project.background.asset?[project.background.asset]:[])];
}
export function putScreen(slide,locale,asset) {
  if(locale==='source')Object.assign(slide,asset);
  else {const current=screenFor(slide,locale);slide.screens??={};slide.screens[locale]={...asset,screenFit:asset.screenFit??current.screenFit??'cover',screenScale:asset.screenScale??current.screenScale??1,screenX:asset.screenX??current.screenX??0,screenY:asset.screenY??current.screenY??0};}
}
