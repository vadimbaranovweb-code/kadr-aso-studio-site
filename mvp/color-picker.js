import {preserveTextSelection} from './selection-preview.js';
export const hexToRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export const rgbToHex=values=>'#'+values.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0))).toString(16).padStart(2,'0')).join('').toUpperCase();
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
export function rgbToHSV(values){const [r,g,b]=values.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;return [h,max===0?0:d/max,max];}
export function hsvToRGB([h,s,v]){const c=v*s,x=c*(1-Math.abs(((h%360)/60)%2-1)),m=v-c;const a=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return a.map(n=>Math.round((n+m)*255));}
export function hsvToHSL([h,s,v]){const l=v*(1-s/2);return [h,l===0||l===1?0:(v-l)/Math.min(l,1-l),l];}
export function hslToHSV([h,s,l]){const v=l+s*Math.min(l,1-l);return [h,v===0?0:2*(1-l/v),v];}
export function mountColorPicker({dialog,anchor,value,opacity=1,allowOpacity=false,onChange,onOpacity,onSample,onClose,decoration,onDecoration,onReset,keepSelection=false}){
 const events=new AbortController(),signal=events.signal,selection=keepSelection?preserveTextSelection(anchor):null;let closed=false;
 const close=({focus=false}={})=>{if(closed)return;closed=true;events.abort();dialog.onclose=null;dialog.removeAttribute('open');anchor?.setAttribute('aria-expanded','false');if(focus&&anchor?.isConnected){if(selection)selection.restore();else anchor.focus({preventScroll:true});}selection?.dispose();onClose?.();};
 const content=dialog.querySelector('#color-content');let hsv=rgbToHSV(hexToRGB(value)),mode='HEX',pointer=null;
 content.innerHTML=`<div class="sv-plane" role="group" aria-label="Насыщенность и яркость"><span class="sv-cursor"></span></div><div class="sv-access"><label>Насыщенность<input data-saturation aria-label="Насыщенность" type="range" min="0" max="100"></label><label>Яркость<input data-value aria-label="Яркость" type="range" min="0" max="100"></label></div><input class="hue-bar" aria-label="Оттенок" data-hue type="range" min="0" max="359" step="1">${allowOpacity?'<label class="alpha-label">Непрозрачность <output data-alpha-value></output><input class="alpha-bar" data-alpha aria-label="Непрозрачность" type="range" min="0" max="100"></label>':''}<div class="picker-values"><select data-mode aria-label="Цветовая модель"><option>HEX</option><option>RGB</option><option>HSL</option></select><div data-fields></div></div><button class="button eyedropper" type="button">Пипетка</button>`;
 if(decoration){
  content.insertAdjacentHTML('afterbegin',`<div class="segmented accent-modes" aria-label="Оформление выделения"><button type="button" data-accent-style="text">Цвет текста</button><button type="button" data-accent-style="pill">Плашка</button></div><label class="accent-radius">Скругление <output></output><input type="range" min="0" max="24" step="1" aria-label="Скругление плашки"></label>`);
  content.insertAdjacentHTML('beforeend','<button type="button" class="button small" data-reset-accent>Убрать оформление</button>');
  const radius=content.querySelector('.accent-radius');
  const refresh=()=>{for(const b of content.querySelectorAll('[data-accent-style]'))b.setAttribute('aria-pressed',String(b.dataset.accentStyle===decoration.style));radius.hidden=decoration.style!=='pill';radius.querySelector('input').value=decoration.radius;radius.querySelector('output').textContent=decoration.radius+' px';};
  for(const b of content.querySelectorAll('[data-accent-style]'))b.onclick=()=>{decoration.style=b.dataset.accentStyle;refresh();onDecoration({...decoration});};
  radius.querySelector('input').addEventListener('input',e=>{decoration.radius=+e.target.value;refresh();onDecoration({...decoration});});
  content.querySelector('[data-reset-accent]').onclick=()=>{onReset();close({focus:true});};refresh();
 }
 const plane=content.querySelector('.sv-plane'),cursor=content.querySelector('.sv-cursor'),fields=content.querySelector('[data-fields]');
 function fieldsHTML(){const nums=mode==='RGB'?hexToRGB(value):hsvToHSL(hsv).map((v,i)=>Math.round(i?v*100:v));fields.innerHTML=mode==='HEX'?`<input data-hex aria-label="HEX" value="${value}" maxlength="7">`:nums.map((v,i)=>`<input data-component="${i}" aria-label="${mode[i]}" type="number" min="0" max="${mode==='RGB'?255:i===0?359:100}" value="${v}">`).join('');}
 function paint(){plane.style.background=`linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv[0]} 100% 50%))`;cursor.style.left=hsv[1]*100+'%';cursor.style.top=(1-hsv[2])*100+'%';cursor.style.background=value;content.querySelector('[data-hue]').value=hsv[0];content.querySelector('[data-saturation]').value=hsv[1]*100;content.querySelector('[data-value]').value=hsv[2]*100;if(allowOpacity){content.querySelector('[data-alpha]').value=opacity*100;content.querySelector('[data-alpha-value]').textContent=Math.round(opacity*100)+'%';}}
 function apply(next,{fromHSV=false,refresh=true}={}){value=next;if(!fromHSV)hsv=rgbToHSV(hexToRGB(value));paint();if(refresh)fieldsHTML();onChange(value);}
 function choose(e){const r=plane.getBoundingClientRect();hsv[1]=clamp((e.clientX-r.left)/r.width);hsv[2]=1-clamp((e.clientY-r.top)/r.height);apply(rgbToHex(hsvToRGB(hsv)),{fromHSV:true});}
 plane.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();pointer=e.pointerId;plane.setPointerCapture(pointer);choose(e);};plane.onpointermove=e=>{if(pointer===e.pointerId)choose(e);};plane.onpointerup=plane.onpointercancel=()=>pointer=null;
 content.querySelector('[data-mode]').onchange=e=>{mode=e.target.value;fieldsHTML();};
 content.oninput=e=>{const el=e.target;if(el.hasAttribute('data-hue')||el.hasAttribute('data-saturation')||el.hasAttribute('data-value')){const i=el.hasAttribute('data-hue')?0:el.hasAttribute('data-saturation')?1:2;hsv[i]=+el.value/(i?100:1);apply(rgbToHex(hsvToRGB(hsv)),{fromHSV:true});}
 if(el.hasAttribute('data-alpha')){opacity=+el.value/100;paint();onOpacity?.(opacity);}
 if(el.hasAttribute('data-hex')){const hex='#'+el.value.replace(/^#/,'');const valid=/^#[0-9a-f]{6}$/i.test(hex);el.setAttribute('aria-invalid',String(!valid));if(valid)apply(hex.toUpperCase(),{refresh:false});}
 if(el.hasAttribute('data-component')){const inputs=[...fields.querySelectorAll('input')];if(inputs.every(x=>x.value!==''&&x.validity.valid)){let nums=inputs.map(x=>+x.value);if(mode==='HSL'){hsv=hslToHSV(nums.map((v,i)=>i?v/100:v));nums=hsvToRGB(hsv);}apply(rgbToHex(nums),{fromHSV:mode==='HSL',refresh:false});}}
 };
 fields.onfocusout=e=>{if(e.target.getAttribute('aria-invalid')==='true'){e.target.value=value;e.target.removeAttribute('aria-invalid');}};
 content.querySelector('.eyedropper').onclick=async()=>{close();if('EyeDropper' in window){try{const result=await new EyeDropper().open();onChange(result.sRGBHex);}catch(e){if(e.name!=='AbortError')onSample();}}else onSample();};
 fieldsHTML();paint();dialog.setAttribute('open','');anchor?.setAttribute('aria-expanded','true');
 const header=dialog.querySelector('header'),bounds=anchor?.getBoundingClientRect();
 if(keepSelection)dialog.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault();},{signal});
 function position(x,y){const width=dialog.offsetWidth,height=dialog.offsetHeight;dialog.style.left=Math.max(12,Math.min(x,innerWidth-width-12))+'px';dialog.style.top=Math.max(12,Math.min(y,innerHeight-height-12))+'px';}
 // A nonmodal, movable inspector: no backdrop and no focus trap.
 position(bounds?(bounds.right+12+dialog.offsetWidth<=innerWidth?bounds.right+12:bounds.left-dialog.offsetWidth-12):24,bounds?.top??100);
 let drag=null;
 header.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button'))return;const r=dialog.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};header.setPointerCapture(e.pointerId);e.preventDefault();},{signal});
 header.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)position(e.clientX-drag.x,e.clientY-drag.y);},{signal});
 for(const type of ['pointerup','pointercancel'])header.addEventListener(type,()=>drag=null,{signal});
 dialog.querySelector('[data-close-color]').addEventListener('click',()=>close({focus:true}),{signal});
 document.addEventListener('pointerdown',e=>{if(!dialog.contains(e.target)&&!anchor?.contains(e.target))close();},{capture:true,signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close({focus:true});}},{capture:true,signal});
 window.addEventListener('resize',()=>{const r=dialog.getBoundingClientRect();position(r.left,r.top);},{signal});
 const observer=new ResizeObserver(()=>{const r=dialog.getBoundingClientRect();position(r.left,r.top);});observer.observe(dialog);signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
 // A queued close event from the previous inspector must not close a reopened one.
 dialog.onclose=()=>{if(!dialog.open)close();};return {close};
}
