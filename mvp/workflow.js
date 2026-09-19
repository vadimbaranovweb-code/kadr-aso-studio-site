// View migration does not modify the portable v7 project or its archived locales.
export const WIZARD_VERSION=5;
export const STEPS=['Формат','Экраны','Редактор','Экспорт'];
export function restoreStep(view={},hasSlides=true){
 const n=Number(view.step);let step=Number.isInteger(n)?n:3;
 if(view.wizardVersion===4)step=({1:1,2:2,3:3,4:3,5:4,6:4})[step]??3;
 else if(view.wizardVersion===3)step=({1:1,2:2,3:3,4:3,5:4})[step]??3;
 else if(view.wizardVersion!==5)step=step>=3?3:step;
 step=Math.max(1,Math.min(STEPS.length,step));return !hasSlides&&step>2?2:step;
}
export function canVisit(step,hasSlides){return Number.isInteger(step)&&step>=1&&step<=STEPS.length&&(step<=2||hasSlides);}
