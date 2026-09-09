import {PHONE,isPhone3D} from './phone-data.js';
const rad=d=>d*Math.PI/180;
export function wrapLines(ctx,text,maxWidth){
  const lines=[];
  for(const p of text.split('\n')){
    if(!p.trim()){lines.push('');continue;}let line='';
    for(const word of p.trim().split(/\s+/)){
      if(ctx.measureText(word).width>maxWidth){if(line){lines.push(line);line='';}for(const letter of [...word]){if(line&&ctx.measureText(line+letter).width>maxWidth){lines.push(line);line='';}line+=letter;}}
      else{const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}
    }if(line)lines.push(line);
  }return lines;
}
export function font(ctx,l,w){ctx.font=`${l.fontWeight} ${l.fontSize*w/414}px "${l.fontFamily}"`;}
export function layerRect(l,img,w,h,ctx){
  const width=l.width*w/100;let height;
  if(l.type==='text'){font(ctx,l,w);height=Math.max(1,wrapLines(ctx,l.text,width).length)*l.fontSize*w/414*l.lineHeight;}
  else if(isPhone3D(l))height=width*PHONE.height/PHONE.width;
  else if(l.type==='device'){const pad=l.deviceFrame?width*.022:0;height=(width-2*pad)*img.height/img.width+2*pad;}
  else if(l.type==='crop')height=width*(img.height*l.crop.h)/(img.width*l.crop.w);
  else height=width*img.height/img.width;
  return {x:l.x*w/100,y:l.y*h/100,w:width,h:height};
}
export function projectPoint(u,v,r,l){
  let x=u-r.w/2,y=v-r.h/2,z=0;
  const ax=rad(l.pitch||0),ay=rad(l.yaw||0),az=rad(l.rotation||0);
  z=y*Math.sin(ax);y*=Math.cos(ax);
  const xx=x*Math.cos(ay)+z*Math.sin(ay);z=-x*Math.sin(ay)+z*Math.cos(ay);x=xx;
  const distance=Math.max(r.w,r.h)*2.6,scale=distance/(distance+z);
  x*=scale;y*=scale;
  return {x:r.x+r.w/2+x*Math.cos(az)-y*Math.sin(az),y:r.y+r.h/2+x*Math.sin(az)+y*Math.cos(az)};
}
export function corners(r,l){return [[0,0],[r.w,0],[r.w,r.h],[0,r.h]].map(([x,y])=>projectPoint(x,y,r,l));}
export function pointInPolygon(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function bounds(points){return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),w:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),h:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};}
