export const hexToRGB=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export const rgbToHex=values=>'#'+values.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0))).toString(16).padStart(2,'0')).join('').toUpperCase();
export function mountColorPicker({dialog,value,onChange,onSample,onClose}){
 const content=dialog.querySelector('#color-content');
 content.innerHTML=`<input class="native-color" type="color" aria-label="Палитра цвета" value="${value}"><label class="hex-label">HEX<input data-hex value="${value.toUpperCase()}" maxlength="7" aria-label="HEX"></label><div class="rgb-fields">${['R','G','B'].map((label,i)=>`<label>${label}<input data-rgb="${i}" aria-label="${label}" type="number" min="0" max="255" value="${hexToRGB(value)[i]}"></label>`).join('')}</div><button class="button eyedropper" type="button">Пипетка</button><p class="picker-help">Нажмите на цвет выше, введите HEX или значения RGB.</p>`;
 const native=content.querySelector('[type=color]'),hex=content.querySelector('[data-hex]'),rgb=[...content.querySelectorAll('[data-rgb]')];
 const apply=(color,source)=>{value=color;native.value=color;if(source!==hex)hex.value=color.toUpperCase();hex.setCustomValidity('');hex.removeAttribute('aria-invalid');rgb.forEach((el,i)=>{if(source!==el)el.value=hexToRGB(color)[i];});onChange(color);};
 native.oninput=()=>apply(native.value,native);
 hex.oninput=()=>{const color='#'+hex.value.replace(/^#/,'');if(/^#[0-9a-f]{6}$/i.test(color))apply(color,hex);else{hex.setCustomValidity('Введите 6 символов HEX');hex.setAttribute('aria-invalid','true');}};
 hex.onblur=()=>{if(!hex.validity.valid){hex.value=value;hex.setCustomValidity('');hex.removeAttribute('aria-invalid');}};
 rgb.forEach(el=>el.oninput=()=>{if(rgb.every(v=>v.value!==''&&v.validity.valid))apply(rgbToHex(rgb.map(v=>v.value)),el);});
 content.querySelector('.eyedropper').onclick=async()=>{dialog.close();if('EyeDropper' in window){try{const result=await new EyeDropper().open();onChange(result.sRGBHex);onClose?.();}catch(e){if(e.name!=='AbortError')onSample();}}else onSample();};
 dialog.onclose=()=>onClose?.();dialog.showModal();
}
