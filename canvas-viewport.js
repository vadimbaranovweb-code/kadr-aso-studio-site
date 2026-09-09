export function createCanvasViewport({getSize,onPanStart}) {
  const $=id=>document.getElementById(id),viewport=$('canvas-viewport'),surface=$('canvas-surface'),wrap=$('canvas-wrap');
  const levels=[.25,.5,.75,1,1.5,2];
  let mode='fit',scale=1,hand=false,space=false,drag=null,request=0,lastSize='';
  function update(recenter=false){
    const [w,h]=getSize(),vw=viewport.clientWidth,vh=viewport.clientHeight;if(!vw||!vh||!w||!h)return;
    const oldWidth=surface.offsetWidth||vw,oldHeight=surface.offsetHeight||vh;
    const cx=(viewport.scrollLeft+vw/2)/oldWidth,cy=(viewport.scrollTop+vh/2)/oldHeight;
    const next=mode==='fit'?Math.min((vw-64)/w,(vh-64)/h,1):Number(mode);
    scale=Math.max(.1,next);
    const width=Math.max(vw,w*scale+64),height=Math.max(vh,h*scale+64);
    surface.style.width=`${width}px`;surface.style.height=`${height}px`;
    wrap.style.width=`${w*scale}px`;wrap.style.height=`${h*scale}px`;
    $('zoom-value').textContent=`${Math.round(scale*100)}%`;
    $('canvas-zoom').value=mode;
    $('zoom-out').disabled=scale<=levels[0];$('zoom-in').disabled=scale>=levels.at(-1);
    if(recenter||lastSize!==`${w}:${h}`){viewport.scrollLeft=width*cx-vw/2;viewport.scrollTop=height*cy-vh/2;}
    lastSize=`${w}:${h}`;
  }
  function set(value){mode=String(value);update(true);}
  function handState(){viewport.classList.toggle('hand-mode',hand||space);$('pan-canvas').setAttribute('aria-pressed',String(hand));}
  $('canvas-zoom').onchange=e=>set(e.target.value);
  $('zoom-in').onclick=()=>set(levels.find(v=>v>scale+.001)??levels.at(-1));
  $('zoom-out').onclick=()=>set([...levels].reverse().find(v=>v<scale-.001)??levels[0]);
  $('pan-canvas').onclick=()=>{hand=!hand;handState();};
  window.addEventListener('keydown',e=>{
    if(e.code!=='Space'||e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
    e.preventDefault();space=true;handState();
  });
  window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;handState();}});
  window.addEventListener('blur',()=>{space=false;finish();handState();});
  viewport.addEventListener('pointerdown',e=>{
    if(!(hand||space||e.button===1)||document.querySelector('dialog[open]'))return;
    e.preventDefault();e.stopImmediatePropagation();onPanStart();viewport.focus({preventScroll:true});viewport.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.classList.add('is-panning');
  },true);
  viewport.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;e.preventDefault();viewport.scrollLeft=drag.left+drag.x-e.clientX;viewport.scrollTop=drag.top+drag.y-e.clientY;});
  function finish(e){if(!drag||(e&&drag.id!==e.pointerId))return;if(viewport.hasPointerCapture(drag.id))viewport.releasePointerCapture(drag.id);drag=null;viewport.classList.remove('is-panning');}
  viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);
  new ResizeObserver(()=>{cancelAnimationFrame(request);request=requestAnimationFrame(()=>update());}).observe(viewport);
  return {update,isPanning:()=>hand||space||Boolean(drag)};
}
