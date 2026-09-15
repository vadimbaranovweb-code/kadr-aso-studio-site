import {screenFor} from './screen-assets.js';
import {cloneProject,applyCopy,formatFor} from './model.js';
import {renderSlide,textColor,compositeColor} from './render.js';
// Editable proposals use real frames, matching the main editor's canvas geometry.
export function mountCopyPreview(container,project,locale,rows,getImage){
 const draft=cloneProject(project);applyCopy(draft,locale,rows);container.replaceChildren();
 const events=new AbortController();let editing=null;
 const shells=rows.map((row,index)=>{
  const shell=document.createElement('div'),canvas=document.createElement('canvas');shell.className='copy-preview-frame';shell.style.aspectRatio=formatFor(draft).width+'/'+formatFor(draft).height;shell.append(canvas);container.append(shell);
  const paint=()=>{
   const active=editing?.shell===shell?editing.field:null,s=draft.slides[index],l=renderSlide(canvas,draft,s,getImage(screenFor(s,draft.locale).image),index,{scale:.3,hideText:active,backgroundImage:getImage(draft.background.asset?.image)});
   for(const el of shell.querySelectorAll('[data-preview-field]')){const field=el.dataset.previewField,heading=field==='title',t=heading?l.title:l.sub,factor=shell.clientWidth/l.w,box=heading?l.titleBox:l.subBox;el.style.setProperty('text-align',box.align,'important');Object.assign(el.style,{left:box.x/l.w*100+'%',top:(heading?l.titleY:l.subtitleY)/l.h*100+'%',width:box.width/l.w*100+'%',height:Math.max(t.size*(heading?1.15:1.35),t.lines.length*t.size*(heading?1.15:1.35))*factor+4+'px',fontSize:t.size*factor+'px',fontWeight:heading?'700':'400',color:draft.textColor||textColor(draft.background.colors.slice(0,draft.background.mode==='solid'?1:2).map((c,i)=>compositeColor(c,draft.background.opacities[i]))),opacity:String((heading?1:.8)*(draft.textOpacity??1)),lineHeight:heading?'1.15':'1.35'});}
  };
  for(const field of ['title',...(draft.subtitleEnabled?['subtitle']:[])]){
   const input=document.createElement('textarea');input.dataset.previewField=field;input.setAttribute('aria-label',`${field==='title'?'Заголовок':'Подзаголовок'} предложения ${index+1}`);input.maxLength=field==='title'?90:160;input.value=row[field];input.spellcheck=true;shell.append(input);
   input.addEventListener('focus',()=>{editing={shell,field};input.classList.add('focused');paint();},{signal:events.signal});
   input.addEventListener('blur',()=>{editing=null;input.classList.remove('focused');paint();},{signal:events.signal});
   input.addEventListener('input',()=>{rows[index][field]=input.value;draft.slides[index][field]=input.value;shells.forEach(s=>s.paint());},{signal:events.signal});
  }
  paint();return {shell,paint};
 });
 const observer=new ResizeObserver(()=>shells.forEach(s=>s.paint()));shells.forEach(s=>observer.observe(s.shell));
 return ()=>{events.abort();observer.disconnect();};
}
