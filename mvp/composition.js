// Normalized, editable layout data. No HTML, source references or model payloads persist.
export const SHAPES=['ellipse','ring','roundedRect','star','arrow'];
const num=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error('Некорректная геометрия композиции.');return v;};
const color=v=>{if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw new Error('Некорректный цвет графики.');return v;};
function textBox(v){if(!v||!['left','center','right'].includes(v.align))throw new Error('Некорректное выравнивание текста.');const out={x:num(v.x,.03,.73),y:num(v.y,.02,.85),width:num(v.width,.2,.94),align:v.align};if(out.x+out.width>1.001)throw new Error('Текст выходит за границу кадра.');return out;}
export function validateComposition(v){
 if(v==null)return null;
 if(typeof v!=='object'||Array.isArray(v)||!v.phone||!Array.isArray(v.decorations)||v.decorations.length>8)throw new Error('Повреждена композиция по референсу.');
 return {title:textBox(v.title),subtitle:textBox(v.subtitle),phone:{x:num(v.phone.x,-.4,.95),y:num(v.phone.y,.05,.95),width:num(v.phone.width,.3,1.4),rotation:num(v.phone.rotation,-20,20)},decorations:v.decorations.map(d=>{if(!d||!SHAPES.includes(d.kind))throw new Error('Неизвестная графика композиции.');return {kind:d.kind,x:num(d.x,-.5,1.2),y:num(d.y,-.5,1.2),width:num(d.width,.01,2),height:num(d.height,.01,2),rotation:num(d.rotation,-180,180),color:color(d.color),opacity:num(d.opacity,0,1)};})};
}
export function cloneComposition(v){return v?{title:{...v.title},subtitle:{...v.subtitle},phone:{...v.phone},decorations:v.decorations.map(d=>({...d}))}:null;}
export function drawDecorations(ctx,composition,w,h){
 for(const d of composition?.decorations||[]){
  ctx.save();ctx.translate((d.x+d.width/2)*w,(d.y+d.height/2)*h);ctx.rotate(d.rotation*Math.PI/180);
  const a=d.width*w,b=d.height*h;ctx.globalAlpha=d.opacity;ctx.fillStyle=d.color;ctx.strokeStyle=d.color;ctx.lineWidth=Math.max(2,Math.min(a,b)*.07);ctx.beginPath();
  if(d.kind==='ellipse'||d.kind==='ring'){ctx.ellipse(0,0,a/2,b/2,0,0,Math.PI*2);d.kind==='ring'?ctx.stroke():ctx.fill();}
  else if(d.kind==='roundedRect'){ctx.roundRect(-a/2,-b/2,a,b,Math.min(a,b)*.18);ctx.fill();}
  else if(d.kind==='star'){for(let i=0;i<8;i++){const t=-Math.PI/2+i*Math.PI/4,r=i%2?.23:.5;const x=Math.cos(t)*a*r,y=Math.sin(t)*b*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}
  else {ctx.moveTo(-a/2,0);ctx.lineTo(a/2,0);ctx.moveTo(a*.15,-b/2);ctx.lineTo(a/2,0);ctx.lineTo(a*.15,b/2);ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
  ctx.restore();
 }
}
