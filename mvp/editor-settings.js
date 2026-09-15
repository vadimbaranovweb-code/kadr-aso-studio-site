export function setFontSize(project,field,value){
 const limits=field==='title'?[18,56]:field==='subtitle'?[12,28]:null;
 if(!limits||!Number.isFinite(value))throw new Error('Некорректный размер текста.');
 const size=Math.max(limits[0],Math.min(limits[1],value));
 for(const slide of project.slides)slide[field+'Size']=size;
 return size;
}
