// iPhone 17 envelope: https://www.apple.com/iphone-17/specs/
// Secondary dimensions are authored approximations, not an official CAD asset.
export const PHONE = Object.freeze({width:71.5,height:149.6,depth:7.95,radius:11.5,screenWidth:67,screenHeight:67*2622/1206,screenRadius:9.3});
export const PHONE_COLORS = [
  ['#bad1e5','Голубой'],['#bdc4ad','Шалфей'],['#c4bfdd','Лавандовый'],['#ededeb','Белый'],['#303238','Чёрный']
];
export const PHONE_DEFAULTS = Object.freeze({deviceModel:'flat',screenFit:'contain',screenX:50,screenY:50,screenZoom:1,island:true,perspective:35,lightDirection:-35,lightIntensity:1,reflection:.12,image:null,sourceName:''});
export const isPhone3D = layer => layer?.type==='device'&&layer.deviceModel==='iphone17';
export const wrapAngle = value => ((value+180)%360+360)%360-180;
export const phoneSettings = layer => ({...PHONE_DEFAULTS,...layer});
export function enablePhone3D(layer){
  for(const [key,value] of Object.entries(PHONE_DEFAULTS))if(layer[key]===undefined)layer[key]=value;
  layer.deviceModel='iphone17';layer.deviceFrame=true;
  if(layer.frameColor==='#171923')layer.frameColor=PHONE_COLORS[0][0];
  return layer;
}
// Source rectangle in image pixels and destination rectangle in screen pixels.
// A single uniform scale preserves all UI proportions for either fitting mode.
export function screenPlacement(iw,ih,sw,sh,settings){
  const l=phoneSettings(settings),scale=(l.screenFit==='cover'?Math.max(sw/iw,sh/ih):Math.min(sw/iw,sh/ih))*l.screenZoom;
  const dw=iw*scale,dh=ih*scale;
  return {sx:0,sy:0,sw:iw,sh:ih,dx:(sw-dw)*l.screenX/100,dy:(sh-dh)*l.screenY/100,dw,dh,scale};
}
export const POSE_KEYS = ['yaw','pitch','rotation','perspective'];
export function poseOf(layer){return Object.fromEntries(POSE_KEYS.map(k=>[k,phoneSettings(layer)[k]??0]));}

// Authored Android envelope follows the selected front-frame proportions; not CAD.
export function phoneDimensions(layer={}){
 if(layer.deviceModel!=='android')return PHONE;
 const ratio=Number(layer.deviceProfile?.ratio)||20/9,radius=Number(layer.deviceProfile?.radius)||.12;
 const screenWidth=67,screenHeight=screenWidth*ratio;
 return {width:71.5,height:screenHeight+4.5,depth:8.2,radius:71.5*radius,screenWidth,screenHeight,screenRadius:Math.max(3,71.5*radius-1.8)};
}
