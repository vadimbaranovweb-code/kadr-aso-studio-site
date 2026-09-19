import * as T from './vendor/three/three.module.js';
import {PHONE,phoneSettings,phoneDimensions} from './phone-data.js';

export function roundedShape(w,h,r){
  const s=new T.Shape(),x=-w/2,y=-h/2; r=Math.min(r,w/2,h/2);
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.absarc(x+w-r,y+r,r,-Math.PI/2,0,false);
  s.lineTo(x+w,y+h-r);s.absarc(x+w-r,y+h-r,r,0,Math.PI/2,false);
  s.lineTo(x+r,y+h);s.absarc(x+r,y+h-r,r,Math.PI/2,Math.PI,false);
  s.lineTo(x,y+r);s.absarc(x+r,y+r,r,Math.PI,Math.PI*1.5,false);s.closePath();return s;
}
function slab(w,h,d,r,b=.18){
  b=Math.max(0,Math.min(b,d/2-.001,r/2));
  const g=new T.ExtrudeGeometry(roundedShape(w-2*b,h-2*b,r-b),{depth:d-2*b,steps:1,bevelEnabled:b>0,bevelSegments:3,bevelSize:b,bevelThickness:b,curveSegments:8});
  g.translate(0,0,-d/2+b);return g;
}
function panel(w,h,r){
  const g=new T.ShapeGeometry(roundedShape(w,h,r),16),p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);
  return g;
}
export function makePhone(layer={}){
  const android=layer.deviceModel==='android',PHONE=phoneDimensions(layer);
  const group=new T.Group();group.name=android?'Screenpack_Android_v1':'Kadr_iPhone17_v1';
  const body=new T.MeshPhysicalMaterial({color:'#bad1e5',metalness:.82,roughness:.29,clearcoat:.3,clearcoatRoughness:.25});
  const glass=new T.MeshPhysicalMaterial({color:'#c9dbea',metalness:.12,roughness:.22,clearcoat:1,clearcoatRoughness:.13});
  const black=new T.MeshStandardMaterial({color:'#080a0e',metalness:.28,roughness:.25});
  const rubber=new T.MeshStandardMaterial({color:'#121722',roughness:.65});
  const lens=new T.MeshPhysicalMaterial({color:'#091a29',metalness:.2,roughness:.07,clearcoat:1,clearcoatRoughness:.03});
  const innerLens=new T.MeshPhysicalMaterial({color:'#112a44',metalness:.38,roughness:.1,clearcoat:1});
  const screenMaterial=new T.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  const reflectionMaterial=new T.MeshPhysicalMaterial({color:'#ffffff',metalness:.05,roughness:.04,transparent:true,opacity:0,depthWrite:false,clearcoat:1});
  function mesh(name,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);group.add(m);return m;}
  mesh('AluminiumBody',slab(PHONE.width,PHONE.height,PHONE.depth,PHONE.radius,.65),body);
  mesh('BackGlass',slab(PHONE.width-1.15,PHONE.height-1.15,.3,PHONE.radius-.55,.10),glass,0,0,-PHONE.depth/2+.06);
  mesh('FrontGlass',slab(PHONE.width-1.15,PHONE.height-1.15,.28,PHONE.radius-.55,.08),black,0,0,PHONE.depth/2-.02);
  const screen=mesh('Display',panel(PHONE.screenWidth,PHONE.screenHeight,PHONE.screenRadius),screenMaterial,0,0,PHONE.depth/2+.14);
  mesh('DisplayReflection',panel(PHONE.screenWidth,PHONE.screenHeight,PHONE.screenRadius),reflectionMaterial,0,0,PHONE.depth/2+.16);
  const island=new T.Group();island.name=android?'PunchHole':'DynamicIsland';group.add(island);
  const pill=new T.Mesh(slab(android?3.4:20.4,android?3.4:5.9,.13,android?1.7:2.95,.025),black);pill.position.set(0,PHONE.screenHeight/2-5.9,PHONE.depth/2+.27);island.add(pill);
  const selfie=new T.Mesh(new T.CircleGeometry(1.1,24),innerLens);selfie.position.set(android?0:6.7,PHONE.screenHeight/2-5.9,PHONE.depth/2+.35);island.add(selfie);
  mesh('Earpiece',slab(10,.33,.16,.16,.02),rubber,0,PHONE.height/2-1,PHONE.depth/2+.02);

  // Back-facing cameras. Their physical placement stays correct after a 180° yaw.
  const px=22.6,py=53.7; // generic dual-camera Android back, not a brand-specific CAD model
  mesh('CameraPlate',slab(20.4,38,1.7,android?4:10.1,.4),glass,px,py,-PHONE.depth/2-.68);
  for(const [i,y] of [py+8.4,py-8.4].entries()){
    const ring=mesh('CameraRing'+i,new T.CylinderGeometry(7.55,7.65,1.6,48),body,px,y,-PHONE.depth/2-2.15);ring.rotation.x=Math.PI/2;
    const surround=mesh('CameraBlack'+i,new T.CylinderGeometry(6.9,6.9,.65,48),black,px,y,-PHONE.depth/2-2.85);surround.rotation.x=Math.PI/2;
    const cover=mesh('CameraGlass'+i,new T.CircleGeometry(6.35,48),lens,px,y,-PHONE.depth/2-3.2);cover.rotation.y=Math.PI;
    const center=mesh('CameraOptic'+i,new T.CircleGeometry(3.1,40),innerLens,px,y,-PHONE.depth/2-3.215);center.rotation.y=Math.PI;
  }
  const flashMat=new T.MeshPhysicalMaterial({color:'#f8f7e6',roughness:.2,clearcoat:1});
  const flash=mesh('Flash',new T.CircleGeometry(2.5,32),flashMat,7.2,py,-PHONE.depth/2-.18);flash.rotation.y=Math.PI;
  const mic=mesh('RearMicrophone',new T.CircleGeometry(.65,16),rubber,9,py-6,-PHONE.depth/2-.18);mic.rotation.y=Math.PI;
  for(const [name,x,y,h] of [['Power',PHONE.width/2,23,14],['CameraControl',PHONE.width/2,-28,18],['VolumeUp',-PHONE.width/2,25,10],['VolumeDown',-PHONE.width/2,10,10],['Action',-PHONE.width/2,43,6]]){
    if(android&&['CameraControl','Action'].includes(name))continue;
    mesh(name,slab(.95,h,2.55,.45,.18),body,x,y,0);
  }
  const antennaMat=new T.MeshStandardMaterial({color:'#849cae',metalness:.2,roughness:.55});
  for(const x of [-PHONE.width/2,PHONE.width/2])for(const y of [-52,52])mesh('Antenna',new T.BoxGeometry(.12,.55,5.5),antennaMat,x,y,0);
  const port=mesh('USBPort',slab(8.5,2.25,.18,1.12,.025),rubber,0,-PHONE.height/2-.05,0);port.rotation.x=Math.PI/2;
  const tongue=mesh('USBInsert',slab(5.3,.38,.2,.16,.015),body,0,-PHONE.height/2-.16,0);tongue.rotation.x=Math.PI/2;
  for(const side of [-1,1])for(let i=0;i<5;i++){
    const hole=mesh('SpeakerPort',new T.CircleGeometry(.64,12),rubber,side*(12+i*2.3),-PHONE.height/2-.06,0);hole.rotation.x=Math.PI/2;
  }
  group.updateMatrixWorld(true);
  return {group,body,glass,screen,screenMaterial,reflectionMaterial,island};
}

const rad=d=>d*Math.PI/180;
export function orientPhone(object,layer){object.rotation.set(rad(layer.pitch||0),rad(layer.yaw||0),-rad(layer.rotation||0),'YXZ');object.updateMatrixWorld(true);}
export const VIEW_SPAN=PHONE.height*1.25;
export function makeCamera(layer){
  const PHONE=phoneDimensions(layer),span=PHONE.height*1.25;
  const fov=phoneSettings(layer).perspective,distance=span/2/Math.tan(rad(fov)/2);
  // Keep depth precision around the phone, including buttons and rear cameras
  // at every rotation. A near plane of .1 lost the .02 mm display/glass gap
  // to depth quantization, producing black tiles even with a 24-bit buffer.
  const radius=Math.hypot(PHONE.width/2+1,PHONE.height/2+1,PHONE.depth/2+4)+1;
  const camera=new T.PerspectiveCamera(fov,1,Math.max(1,distance-radius),distance+radius);
  camera.position.z=distance;camera.updateMatrixWorld();return camera;
}
// A rounded envelope avoids selecting the empty corners of the old flat quad.
export function phoneProjection(layer,rect){
  const PHONE=phoneDimensions(layer),outline=roundedShape(PHONE.width+1.1,PHONE.height+.6,PHONE.radius+.3).getPoints(8);
  const object=new T.Object3D();orientPhone(object,layer);const camera=makeCamera(layer),scale=PHONE.height*1.25*rect.w/PHONE.width;
  const project=(x,y,z)=>{const v=new T.Vector3(x,y,z).applyMatrix4(object.matrixWorld).project(camera);return {x:rect.x+rect.w/2+v.x*scale/2,y:rect.y+rect.h/2-v.y*scale/2};};
  const pts=[];for(const z of [-PHONE.depth/2-.15,PHONE.depth/2+.4])for(const p of outline)pts.push(project(p.x,p.y,z));
  for(const x of [12.4,32.8])for(const y of [34.7,72.7])pts.push(project(x,y,-PHONE.depth/2-3.3));
  const points=convexHull(pts),minx=Math.min(...points.map(p=>p.x)),miny=Math.min(...points.map(p=>p.y));
  return {points,bounds:{x:minx,y:miny,w:Math.max(...points.map(p=>p.x))-minx,h:Math.max(...points.map(p=>p.y))-miny},span:scale,camera};
}
function convexHull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x),lo=[],hi=[];
  for(const p of sorted){while(lo.length>=2&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of sorted.reverse()){while(hi.length>=2&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  lo.pop();hi.pop();return lo.concat(hi);
}
