import {clone,uid} from './model.js';
import {MAX_VERSIONS,versionView} from './version-data.js';

const fields=['format','exportScale','exportBothFormats','frames','references','savedPoses','panoramas'];
const metadata=(name,view)=>({id:uid(),name,createdAt:Date.now(),updatedAt:Date.now(),view:versionView(view)});
export const versionLabel=project=>project.versions?.active.name??'Основная';
export function currentVersionProject(project){
  return {app:'kadr-aso',version:project.localization?7:5,name:project.name,...Object.fromEntries(fields.map(k=>[k,clone(project[k]??(k==='exportBothFormats'?false:[]))])),...(project.localization?{localization:clone(project.localization)}:{})};
}
export function listVersions(project){
  const active=project.versions?.active??{id:null,name:'Основная',createdAt:0,updatedAt:0,view:versionView()};
  return [{...active,project:currentVersionProject(project),current:true},...(project.versions?.saved??[]).map(v=>({...v,current:false}))]
    .sort((a,b)=>a.createdAt-b.createdAt);
}
export function nextVersionName(project,prefix='Вариант'){
  const names=new Set(listVersions(project).map(v=>v.name.toLocaleLowerCase()));let n=2;
  while(names.has(`${prefix} ${n}`.toLocaleLowerCase()))n++;return `${prefix} ${n}`.slice(0,60);
}
function nameFor(project,name,except=undefined){
  if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw new Error('Укажи название версии: от 1 до 60 символов.');
  const clean=name.trim();if(listVersions(project).some(v=>v.id!==except&&v.name.toLocaleLowerCase()===clean.toLocaleLowerCase()))throw new Error('Версия с таким названием уже есть.');return clean;
}
function prepare(project,view){
  const next=clone(project);next.version=project.version===7?7:6;next.versions??={active:metadata('Основная',view),saved:[]};return next;
}
function copyContent(target,source){for(const k of fields)target[k]=clone(source[k]??(k==='exportBothFormats'?false:[]));if(source.localization){target.localization=clone(source.localization);target.version=7;}else delete target.localization;}
export function createProjectVersion(project,name,view={},candidate=project,candidateView=view){
  if(listVersions(project).length>=MAX_VERSIONS)throw new Error(`В проекте уже ${MAX_VERSIONS} версий. Скачай и удали ненужную, чтобы добавить новую.`);
  const label=nameFor(project,name),next=prepare(project,view),book=next.versions;
  book.saved.push({...book.active,updatedAt:Date.now(),view:versionView(view),project:currentVersionProject(project)});
  book.active=metadata(label,candidateView);copyContent(next,candidate);
  return {project:next,view:versionView(candidateView)};
}
export function switchProjectVersion(project,id,view={}){
  const target=project.versions?.saved.find(v=>v.id===id);if(!target)throw new Error('Эта версия больше недоступна.');
  const next=clone(project),book=next.versions;
  const parked={...book.active,updatedAt:Date.now(),view:versionView(view),project:currentVersionProject(project)};
  book.saved=book.saved.map(v=>v.id===id?parked:v);
  const {project:content,...meta}=target;book.active=clone(meta);copyContent(next,content);
  return {project:next,view:versionView(meta.view)};
}
export function renameProjectVersion(project,id,name,view={}){
  const label=nameFor(project,name,id),next=prepare(project,view),book=next.versions;
  const target=id===null||id===book.active.id?book.active:book.saved.find(v=>v.id===id);
  if(!target)throw new Error('Эта версия больше недоступна.');target.name=label;return {project:next,view:versionView(view)};
}
export function removeProjectVersion(project,id,view={}){
  if(!project.versions?.saved.some(v=>v.id===id))throw new Error('Можно удалить только неактивную версию.');
  const next=clone(project);next.versions.saved=next.versions.saved.filter(v=>v.id!==id);return {project:next,view:versionView(view)};
}
export function exportProjectVersion(project,id=null){
  const entry=listVersions(project).find(v=>id===null?v.current:v.id===id);if(!entry)throw new Error('Эта версия больше недоступна.');
  const single=currentVersionProject(entry.project);single.name=`${project.name} · ${entry.name}`.slice(0,64);return {project:single,label:entry.name};
}
