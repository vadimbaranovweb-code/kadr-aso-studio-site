export const MAX_VERSIONS=8;
export function versionView(value={}){
  return {active:Number.isInteger(value?.active)&&value.active>=0&&value.active<6?value.active:0,
    panoEditing:Boolean(value?.panoEditing),selectedIndex:Number.isInteger(value?.selectedIndex)&&value.selectedIndex>=-1&&value.selectedIndex<48?value.selectedIndex:-1,
    editScope:value?.editScope==='format'?'format':'all'};
}
export function validateVersionBook(book,validateSnapshot){
  const fail=()=>{throw new Error('В файле некорректные версии комплекта.');},seen=new Set();
  if(!book||!Array.isArray(book.saved)||book.saved.length>=MAX_VERSIONS)fail();
  function meta(v){
    if(!v||typeof v.id!=='string'||!v.id||v.id.length>100||seen.has(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>60)fail();
    for(const k of ['createdAt','updatedAt'])if(!Number.isFinite(v[k])||v[k]<0||v[k]>8640000000000000)fail();
    seen.add(v.id);return {id:v.id,name:v.name,createdAt:v.createdAt,updatedAt:v.updatedAt,view:versionView(v.view)};
  }
  const active=meta(book.active),saved=book.saved.map(v=>{
    const m=meta(v);if(![5,7].includes(v.project?.version)||v.project.versions!==undefined)fail();
    return {...m,project:validateSnapshot(v.project)};
  });
  return {active,saved};
}
