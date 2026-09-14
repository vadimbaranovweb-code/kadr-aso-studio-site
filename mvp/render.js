import {formatFor} from './model.js';
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
  const store=formatFor(project),w=440,h=440*store.height/store.width;
  const title=fitText(ctx,slide.title,{width:w-64,size:slide.titleSize??34,minSize:slide.titleSize&&slide.titleSize!==34?slide.titleSize:21,maxLines:3,weight:700});
  const sub=fitText(ctx,project.subtitleEnabled?slide.subtitle:'',{width:w-72,size:slide.subtitleSize??17,minSize:slide.subtitleSize&&slide.subtitleSize!==17?slide.subtitleSize:13,maxLines:3,weight:400});
  const titleY=48,titleHeight=slide.title?title.lines.length*title.size*1.15:0;
  const subtitleY=titleY+titleHeight+(titleHeight?15:0);
  const subtitleHeight=project.subtitleEnabled&&slide.subtitle?sub.lines.length*sub.size*1.35:0;
  const textBottom=subtitleY+subtitleHeight;
  const top=Math.max(h*.28,textBottom+30);
  const device=deviceFor(project);
  const ratio=project.frame==='none'?slide.height/slide.width:project.frame==='device'?device.ratio:project.store==='apple'?2868/1320:20/9;
  const padding=project.frame==='device'?device.padding:project.frame==='outline'?3:0;
  const fitted=Math.min(w*.8,(h-top-32-2*padding)/ratio+2*padding);
  const width=project.phoneScale!=null?fitted*project.phoneScale:project.layout==='full'?Math.min(w*.8,(h-top-32-2*padding)/ratio+2*padding):w*.88*(project.cropScale??1);
  const height=(width-2*padding)*ratio+2*padding;
  const y=project.phoneScale!=null?Math.max(textBottom+24,top+h*(project.phoneY??0)):project.layout==='crop'?Math.max(textBottom+24,top-h*(project.cropRaise??0)):top;
  return {w,h,title,sub,titleY,subtitleY,titleHeight,subtitleHeight,phone:{x:(w-width)/2,y,width,height,padding,ratio},overflow:title.overflow||sub.overflow};
}
export function renderSlide(canvas,project,slide,image,index=0,{scale=1,hideText=null}={}){
  const spec=formatFor(project);canvas.width=Math.round(spec.width*scale);canvas.height=Math.round(spec.height*scale);
  const ctx=canvas.getContext('2d'),factor=canvas.width/440;
  ctx.setTransform(factor,0,0,factor,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const layout=frameLayout(ctx,project,slide),{w,h,phone:p}=layout;
  const count=Math.max(1,project.slides.length),colors=project.background.colors.map((c,i)=>compositeColor(c,project.background.opacities?.[i]??1));
  if(project.background.mode==='solid')ctx.fillStyle=colors[0];else{
    let gradient;
    if(project.background.angle==null)gradient=ctx.createLinearGradient(-index*w,0,(count-index)*w,h*.35);
    else{const a=project.background.angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),length=Math.abs(count*w*dx)+Math.abs(h*dy),cx=count*w/2-index*w,cy=h/2;gradient=ctx.createLinearGradient(cx-dx*length/2,cy-dy*length/2,cx+dx*length/2,cy+dy*length/2);}
    gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);ctx.fillStyle=gradient;
  }
  ctx.fillRect(0,0,w,h);
  const color=project.textColor||textColor(project.background.mode==='solid'?[colors[0]]:colors);
  ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='top';ctx.globalAlpha=project.textOpacity??1;
  ctx.font=`700 ${layout.title.size}px Arial`;
  if(slide.title&&hideText!=='title')layout.title.lines.forEach((line,i)=>highlightLine(ctx,line,w/2,layout.titleY+i*layout.title.size*1.15,slide.titleHighlight,slide.titleHighlightColor,color));
  ctx.font=`400 ${layout.sub.size}px Arial`;ctx.globalAlpha=.8*(project.textOpacity??1);
  if(project.subtitleEnabled&&slide.subtitle&&hideText!=='subtitle')layout.sub.lines.forEach((line,i)=>highlightLine(ctx,line,w/2,layout.subtitleY+i*layout.sub.size*1.35,slide.subtitleHighlight,slide.subtitleHighlightColor,color));
  ctx.globalAlpha=1;
  const original=deviceFor(project),tint=(color,light)=>'#'+rgb(color).map(v=>Math.round(light>=0?v+(255-v)*light:v*(1+light)).toString(16).padStart(2,'0')).join('');
  const device=project.deviceColor?{...original,body:tint(project.deviceColor,-.45),metal:[.05,.8,-.25,.4,-.4].map(n=>tint(project.deviceColor,n))}:original;
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
    const box=screenRect(slide,{x:sx,y:sy,width:sw,height:sh});
    ctx.drawImage(image,box.x,box.y,box.width,box.height);
  }
  ctx.restore();
  if(project.frame==='device'){
    ctx.fillStyle='#11151B';
    if(device.island){round(ctx,w/2-p.width*.135,sy+sw*.035,p.width*.27,p.width*.075,p.width*.04);ctx.fill();}
    else{ctx.beginPath();ctx.arc(w/2,sy+sw*.035,sw*device.hole,0,Math.PI*2);ctx.fill();}
  }
  return layout;
}

export function compositeColor(hex,alpha=1){return '#'+rgb(hex).map(v=>Math.round(v*alpha+255*(1-alpha)).toString(16).padStart(2,'0')).join('');}
export function screenRect(slide,box){const fit=(slide.screenFit==='cover'?Math.max:Math.min)(box.width/slide.width,box.height/slide.height)*(slide.screenScale??1),width=slide.width*fit,height=slide.height*fit;return {x:box.x+(box.width-width)/2+(slide.screenX??0)*Math.max(0,width-box.width)/2,y:box.y+(box.height-height)/2+(slide.screenY??0)*Math.max(0,height-box.height)/2,width,height};}
function highlightLine(ctx,line,cx,y,phrase,accent,base){const key=(phrase||'').toLocaleLowerCase(),lower=line.toLocaleLowerCase();ctx.textAlign='left';let x=cx-ctx.measureText(line).width/2,pos=0;while(pos<line.length){const match=key?lower.indexOf(key,pos):-1,end=match<0?line.length:match;ctx.fillStyle=base;const plain=line.slice(pos,end);ctx.fillText(plain,x,y);x+=ctx.measureText(plain).width;if(match<0)break;const text=line.slice(match,match+key.length);ctx.fillStyle=accent||'#2563EB';ctx.fillText(text,x,y);x+=ctx.measureText(text).width;pos=match+key.length;}ctx.fillStyle=base;ctx.textAlign='center';}
