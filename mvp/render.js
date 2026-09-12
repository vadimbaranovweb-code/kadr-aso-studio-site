import {STORES} from './model.js';
import {deviceFor} from './devices.js';
const round=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function textColor(colors){
  const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const values=colors.map(luminance),dark=Math.min(...values.map(l=>(l+.05)/.05)),light=Math.min(...values.map(l=>1.05/(l+.05)));
  return dark>=light?'#101C2B':'#FFFFFF';
}
function wrap(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';
    for(const word of paragraph.trim().split(/\s+/)){
      if(ctx.measureText(line?line+' '+word:word).width<=maxWidth){line=line?line+' '+word:word;continue;}
      if(line){lines.push(line);line='';}
      for(const char of word){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line='';}line+=char;}
    }
    lines.push(line);
  }
  return lines;
}
function fitText(ctx,text,{width,size,minSize,maxLines,weight}){
  let lines;
  do{ctx.font=`${weight} ${size}px Arial`;lines=wrap(ctx,text,width);if(lines.length<=maxLines)break;size--;}while(size>=minSize);
  return {lines,size:Math.max(size,minSize),overflow:lines.length>maxLines};
}
export function frameLayout(ctx,project,slide){
  const store=STORES[project.store],w=440,h=440*store.height/store.width;
  const title=fitText(ctx,slide.title,{width:w-64,size:34,minSize:21,maxLines:3,weight:700});
  const sub=fitText(ctx,project.subtitleEnabled?slide.subtitle:'',{width:w-72,size:17,minSize:13,maxLines:3,weight:400});
  const titleY=48,titleHeight=slide.title?title.lines.length*title.size*1.15:0;
  const subtitleY=titleY+titleHeight+(titleHeight?15:0);
  const subtitleHeight=project.subtitleEnabled&&slide.subtitle?sub.lines.length*sub.size*1.35:0;
  const top=Math.max(h*.28,subtitleY+subtitleHeight+30);
  const device=deviceFor(project);
  const ratio=project.frame==='none'?slide.height/slide.width:project.frame==='device'?device.ratio:project.store==='apple'?2868/1320:20/9;
  const padding=project.frame==='device'?device.padding:project.frame==='outline'?3:0;
  const width=project.layout==='full'?Math.min(w*.8,(h-top-32-2*padding)/ratio+2*padding):w*.88;
  const height=(width-2*padding)*ratio+2*padding;
  return {w,h,title,sub,titleY,subtitleY,phone:{x:(w-width)/2,y:top,width,height,padding,ratio},overflow:title.overflow||sub.overflow};
}
export function renderSlide(canvas,project,slide,image,index=0,{scale=1}={}){
  const spec=STORES[project.store];canvas.width=Math.round(spec.width*scale);canvas.height=Math.round(spec.height*scale);
  const ctx=canvas.getContext('2d'),factor=canvas.width/440;
  ctx.setTransform(factor,0,0,factor,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const layout=frameLayout(ctx,project,slide),{w,h,phone:p}=layout;
  const count=Math.max(1,project.slides.length),colors=project.background.colors;
  if(project.background.mode==='solid')ctx.fillStyle=colors[0];else{
    const gradient=ctx.createLinearGradient(-index*w,0,(count-index)*w,h*.35);
    gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);ctx.fillStyle=gradient;
  }
  ctx.fillRect(0,0,w,h);
  const color=textColor(project.background.mode==='solid'?[colors[0]]:colors);
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='top';
  ctx.font=`700 ${layout.title.size}px Arial`;
  if(slide.title)layout.title.lines.forEach((line,i)=>ctx.fillText(line,w/2,layout.titleY+i*layout.title.size*1.15));
  ctx.font=`400 ${layout.sub.size}px Arial`;ctx.globalAlpha=.8;
  if(project.subtitleEnabled&&slide.subtitle)layout.sub.lines.forEach((line,i)=>ctx.fillText(line,w/2,layout.subtitleY+i*layout.sub.size*1.35));
  ctx.globalAlpha=1;
  const device=deviceFor(project);
  const radius=project.frame==='device'?p.width*device.radius:project.frame==='outline'?p.width*.08:12;
  ctx.save();ctx.shadowColor='#0713242B';ctx.shadowBlur=20;ctx.shadowOffsetY=12;
  round(ctx,p.x,p.y,p.width,p.height,radius);ctx.fillStyle=project.frame==='device'?device.body:project.frame==='outline'?color:'#FFFFFF';ctx.fill();ctx.restore();
  if(project.frame==='device'){
    const metal=ctx.createLinearGradient(p.x,0,p.x+p.width,0);[0,.15,.52,.85,1].forEach((stop,i)=>metal.addColorStop(stop,device.metal[i]));
    round(ctx,p.x+1,p.y+1,p.width-2,p.height-2,radius-1);ctx.strokeStyle=metal;ctx.lineWidth=2.2;ctx.stroke();
    ctx.fillStyle=device.metal[2];for(const [start,length] of device.buttons){round(ctx,p.x+p.width-1,p.y+p.height*start,3,p.height*length,1);ctx.fill();}
    if(device.island||device.legacy){round(ctx,p.x-2,p.y+p.height*.2,3,p.height*.08,1);ctx.fill();}
  }
  const sx=p.x+p.padding,sy=p.y+p.padding,sw=p.width-2*p.padding,sh=p.height-2*p.padding;
  ctx.save();round(ctx,sx,sy,sw,sh,Math.max(4,radius-p.padding));ctx.clip();ctx.fillStyle='#F7F9FC';ctx.fillRect(sx,sy,sw,sh);
  if(image){
    const fit=Math.min(sw/slide.width,sh/slide.height),iw=slide.width*fit,ih=slide.height*fit;
    ctx.drawImage(image,sx+(sw-iw)/2,sy+(sh-ih)/2,iw,ih);
  }
  ctx.restore();
  if(project.frame==='device'){
    ctx.fillStyle='#11151B';
    if(device.island){round(ctx,w/2-p.width*.135,sy+sw*.035,p.width*.27,p.width*.075,p.width*.04);ctx.fill();}
    else{ctx.beginPath();ctx.arc(w/2,sy+sw*.035,sw*device.hole,0,Math.PI*2);ctx.fill();}
  }
  return layout;
}
