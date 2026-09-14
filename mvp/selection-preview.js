// Keep a native textarea range visible when a color field needs keyboard focus.
// The mirror follows the textarea's own wrapping, never draws into exported PNGs.
export function preserveTextSelection(input){
 const start=input.selectionStart,end=input.selectionEnd,direction=input.selectionDirection;
 const mirror=document.createElement('div'),selected=document.createElement('span');
 mirror.className='selection-ghost';mirror.setAttribute('aria-hidden','true');
 mirror.append(document.createTextNode(input.value.slice(0,start)),selected,document.createTextNode(input.value.slice(end)));
 selected.textContent=input.value.slice(start,end);input.after(mirror);input.classList.add('selection-with-picker');
 const events=new AbortController();
 const sync=()=>{const style=getComputedStyle(input);for(const key of ['left','top','width','height','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','whiteSpace','overflowWrap','padding','border','boxSizing','opacity'])mirror.style[key]=style[key];mirror.hidden=document.activeElement===input;};
 input.addEventListener('focus',sync,{signal:events.signal});input.addEventListener('blur',sync,{signal:events.signal});
 const observer=new ResizeObserver(sync);observer.observe(input);sync();
 return {restore(){if(input.isConnected){input.focus({preventScroll:true});input.setSelectionRange(start,end,direction);}},dispose(){events.abort();observer.disconnect();mirror.remove();input.classList.remove('selection-with-picker');}};
}
