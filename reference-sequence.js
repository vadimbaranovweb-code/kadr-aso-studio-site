// Positional choices survive project import, which regenerates scene IDs.
export const REFERENCE_ROLES=[
  {id:'reference',name:'По референсу',hint:'Области текста и телефона из твоей разметки.'},
  {id:'detail',name:'Крупная деталь UI',hint:'Телефон и увеличенный фрагмент исходного экрана.'},
  {id:'immersive',name:'Крупный телефон',hint:'Больше места для интерфейса, короткий блок текста сверху.'},
  {id:'angled',name:'Другой ракурс',hint:'Наклон и перспектива телефона, текст сверху.'},
  {id:'side',name:'Телефон сбоку',hint:'Текст слева, смещённый телефон справа.'},
  {id:'bottom',name:'Заголовок снизу',hint:'Телефон сверху, текст в нижней части кадра.'},
  {id:'closing',name:'Финальный акцент',hint:'Спокойный фронтальный телефон и центрированный текст.'}
];
const sequences={1:['reference'],2:['reference','closing'],3:['reference','detail','closing'],4:['reference','detail','side','closing'],5:['reference','detail','angled','bottom','closing'],6:['reference','detail','angled','side','bottom','closing']};
export function referenceRoles(count,choices=[]){
  if(!sequences[count])throw new Error('Для сборки нужно от 1 до 6 кадров.');
  return sequences[count].map((role,i)=>choices[i]&&choices[i]!=='auto'?choices[i]:role);
}
const box=(x,y,w,h)=>({x,y,w,h});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function referenceRoleLayout(recipe,role){
  if(role==='reference')return {...recipe,role};
  // Keep the reference's text density and outer margins while changing the
  // reading order. Content fitting happens later against real text and UI.
  const inset=clamp(recipe.title.x,6,12),width=100-inset*2;
  const titleHeight=clamp(recipe.title.h,18,28),top=clamp(recipe.title.y,5,8);
  const phoneTop=top+titleHeight+4,available=96-phoneTop;
  const result={...recipe,role,title:box(inset,top,width,titleHeight),phone:box(7,phoneTop,86,available),pose:{rotation:0,yaw:0,pitch:0}};
  if(role==='detail'){
    result.phone=box(28,phoneTop+1,64,available-2);
    result.pose={rotation:4,yaw:-12,pitch:4};
    result.detail=box(inset,Math.min(68,phoneTop+available*.46),width,24);
  }else if(role==='immersive'){
    result.title=box(inset,top,width,titleHeight);result.phone=box(4,phoneTop,92,available+3);
  }else if(role==='angled'){
    result.phone=box(5,phoneTop,90,available);
    result.pose={rotation:clamp(recipe.rotation+10,-24,24),yaw:26,pitch:-6};
  }else if(role==='side'){
    result.title=box(inset,top+5,48,30);const y=Math.max(46,phoneTop+4);result.phone=box(38,y,60,96-y);
    result.align='left';result.pose={rotation:-7,yaw:-20,pitch:5};
  }else if(role==='bottom'){
    result.title=box(inset,96-titleHeight,width,titleHeight);result.phone=box(13,4,74,87-titleHeight);
    result.pose={rotation:clamp(recipe.rotation-5,-18,18),yaw:14,pitch:3};
  }else if(role==='closing'){
    result.title=box(inset,top+3,width,titleHeight);result.phone=box(20,phoneTop+5,60,available-10);result.align='center';
  }else throw new Error('Неизвестная композиция кадра.');
  return result;
}
