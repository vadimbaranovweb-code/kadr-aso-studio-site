// View state only; portable projects keep their existing v6 schema.
export const WIZARD_VERSION=4;
export const STEPS=['Формат','Экраны','AI и референс','Редактор','Локализация','Экспорт'];
export function restoreStep(view={},hasSlides=true){
 const n=Number(view.step);let step=Number.isInteger(n)?n:4;
 if(view.wizardVersion===3)step=({1:1,2:2,3:4,4:4,5:6})[step]??4;
 else if(view.wizardVersion!==4)step=step>=3?4:step;
 step=Math.max(1,Math.min(6,step));return !hasSlides&&step>2?2:step;
}
export function canVisit(step,hasSlides){return Number.isInteger(step)&&step>=1&&step<=6&&(step<=2||hasSlides);}
