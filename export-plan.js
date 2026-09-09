import {FORMATS} from './model.js';

export function exportPlan(project,bothFormats=false){
  const formats=bothFormats?Object.keys(FORMATS):[project.format];
  return formats.flatMap(format=>project.frames.map((frame,index)=>{
    const [w,h]=FORMATS[format];
    return {frame,index,format,width:w*project.exportScale,height:h*project.exportScale,
      name:`${bothFormats?format+'/':''}${String(index+1).padStart(2,'0')}-${w*project.exportScale}x${h*project.exportScale}.png`};
  }));
}
