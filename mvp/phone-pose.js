// Per-slide pose. A null rotation preserves an imported reference's 2D angle.
export const DEFAULT_POSE=Object.freeze({mode:'flat',rotation:null,yaw:0,pitch:0,perspective:35,reflection:.12});
export function validatePose(value){
 if(value===undefined)return {...DEFAULT_POSE};
 if(!value||!['flat','3d'].includes(value.mode))throw new Error('Повреждён поворот телефона.');
 const result={mode:value.mode};
 for(const [key,min,max] of [['rotation',-180,180],['yaw',-180,180],['pitch',-80,80],['perspective',20,60],['reflection',0,1]]){
  const n=value[key]===undefined?DEFAULT_POSE[key]:value[key];
  if(key==='rotation'&&n===null){result[key]=null;continue;}
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw new Error('Недопустимый угол телефона.');result[key]=n;
 }
 return result;
}
export const is3D=(project,slide)=>project.store==='apple'&&project.frame==='device'&&slide.phonePose?.mode==='3d';
export function phoneLayer(project,slide,rotation=0){
 const pose={...DEFAULT_POSE,...slide.phonePose};
 return {type:'device',deviceModel:'iphone17',...pose,rotation,frameColor:project.deviceColor||'#bdc2c9',screenFit:slide.screenFit,screenZoom:slide.screenScale,screenX:50-(slide.screenX??0)*50,screenY:50-(slide.screenY??0)*50,island:true,lightDirection:-35,lightIntensity:1};
}
