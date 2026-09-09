import {REFERENCE_ROLES} from './reference-sequence.js';
const box=(x,y,w,h)=>({x,y,w,h});
export function defaultReferenceRecipe(){
  return {crop:box(0,0,100,100),title:box(8,6,84,22),phone:box(12,32,76,65),background:'#3153f4',ink:'#ffffff',accent:'#bcff70',align:'left',rotation:0,font:'source',device:'source',useColors:true,setLayout:'story',roles:[]};
}
export function validateReferenceRecipe(value){
  const fail=()=>{throw new Error('В референсе некорректные настройки оформления.');};
  if(!value||typeof value!=='object'||Array.isArray(value))fail();
  const result={};
  for(const key of ['crop','title','phone']){
    const b=value[key];if(!b||!['x','y','w','h'].every(k=>Number.isFinite(b[k]))||b.x<0||b.y<0||b.w<2||b.h<2||b.x+b.w>100.001||b.y+b.h>100.001)fail();
    result[key]=box(b.x,b.y,b.w,b.h);
  }
  for(const key of ['background','ink','accent']){if(typeof value[key]!=='string'||!/^#[a-f\d]{6}$/i.test(value[key]))fail();result[key]=value[key];}
  if(!['left','center','right'].includes(value.align)||!['source','flat','iphone17'].includes(value.device)||!['source','Arial','Trebuchet MS','Georgia','Impact'].includes(value.font)||!Number.isFinite(value.rotation)||Math.abs(value.rotation)>30||typeof value.useColors!=='boolean')fail();
  const setLayout=value.setLayout??'repeat',roles=value.roles??[];
  if(!['repeat','story'].includes(setLayout)||!Array.isArray(roles)||roles.length>6||roles.some(r=>r!=='auto'&&!REFERENCE_ROLES.some(v=>v.id===r)))fail();
  return {...result,setLayout,roles:[...roles],align:value.align,device:value.device,font:value.font,rotation:value.rotation,useColors:value.useColors};
}
export function normalizeReferenceBox(b){
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const x=clamp(b.x,0,98),y=clamp(b.y,0,98);
  return box(x,y,clamp(b.w,2,100-x),clamp(b.h,2,100-y));
}
const hex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export function readableInk(background){
  const rgb=background.slice(1).match(/../g).map(v=>parseInt(v,16)),light=luminance(rgb);
  return (light+.05)/.05>=1.05/(light+.05)?'#151821':'#ffffff';
}
// Edge pixels estimate a flat background; saturated image colors supply an
// accent. This is palette sampling, not OCR or object/3D recognition.
export function referencePalette({data,width,height}){
  const all=new Map(),edge=new Map();let count=0;
  const add=(map,rgb)=>{const key=rgb.map(v=>Math.floor(v/24)).join(',');let bucket=map.get(key);if(!bucket){bucket={n:0,sum:[0,0,0]};map.set(key,bucket);}bucket.n++;rgb.forEach((v,i)=>bucket.sum[i]+=v);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4;if(data[at+3]<220)continue;const rgb=[...data.slice(at,at+3)];add(all,rgb);count++;
    if(x<width*.07||x>=width*.93||y<height*.05||y>=height*.95)add(edge,rgb);
  }
  if(!count)return {background:'#ffffff',ink:'#151821',accent:'#3153f4',empty:true};
  const ranked=map=>[...map.values()].map(b=>({n:b.n,rgb:b.sum.map(v=>v/b.n)})).sort((a,b)=>b.n-a.n);
  const bg=ranked(edge.size?edge:all)[0].rgb,background=hex(bg);
  const candidates=ranked(all).filter(b=>Math.max(...b.rgb)-Math.min(...b.rgb)>45&&b.rgb.reduce((s,v,i)=>s+(v-bg[i])**2,0)>2500);
  candidates.sort((a,b)=>(Math.max(...b.rgb)-Math.min(...b.rgb))*Math.sqrt(b.n)-(Math.max(...a.rgb)-Math.min(...a.rgb))*Math.sqrt(a.n));
  return {background,ink:readableInk(background),accent:candidates.length?hex(candidates[0].rgb):readableInk(background),empty:false};
}
