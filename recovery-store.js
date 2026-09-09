import {uid} from './uid.js';
// Device-local recovery cache. Portable .kadr.json files remain the backup that
// survives browser-data cleanup. Images are written only when their bytes change.
const fault=(name,message)=>Object.assign(new Error(message),{name});
export function createRecoveryCodec(){
  let bySource=new Map(),committed=new Set();
  function unpack(record){
    if(!record)return null;
    if(record.head?.version!==1||typeof record.head.token!=='string'||!record.head.token||!Number.isFinite(record.head.updatedAt)||!Array.isArray(record.head.assetIds)||!record.head.snapshot)throw fault('RecoveryDataError','Не удалось прочитать резервную копию.');
    const assets=new Map(record.assets.map(a=>[a.id,a.source]));
    function visit(value){
      if(Array.isArray(value))return value.map(visit);
      if(value&&typeof value==='object'){
        if(Object.hasOwn(value,'recoveryImage')){
          const image=assets.get(value.recoveryImage);
          if(typeof image!=='string')throw fault('RecoveryDataError','В резервной копии не хватает изображения.');
          return image;
        }
        return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,visit(v)]));
      }
      return value;
    }
    const snapshot=visit(record.head.snapshot);
    bySource=new Map(record.assets.map(a=>[a.source,a.id]));committed=new Set(record.head.assetIds);
    return snapshot;
  }
  function pack(snapshot){
    const used=new Map();
    function visit(value,key=''){
      if(key==='image'&&typeof value==='string'&&value.startsWith('data:image/')){
        let id=bySource.get(value);if(!id){id=uid();bySource.set(value,id);}used.set(id,value);return {recoveryImage:id};
      }
      if(Array.isArray(value))return value.map(v=>visit(v));
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,visit(v,key)]));
      return value;
    }
    const encoded=visit(snapshot);
    // Discard cached images removed from the working project; a failed save can
    // keep the database's earlier assets without holding another JS copy here.
    bySource=new Map([...bySource].filter(([,id])=>used.has(id)||committed.has(id)));
    return {head:{version:1,token:uid(),updatedAt:Date.now(),assetIds:[...used.keys()],snapshot:encoded},assets:[...used].filter(([id])=>!committed.has(id)).map(([id,source])=>({id,source}))};
  }
  return {pack,unpack,accept:head=>{committed=new Set(head.assetIds);bySource=new Map([...bySource].filter(([,id])=>committed.has(id)));},reset:()=>{committed.clear();}};
}

export function createRecoveryStore({indexedDB=globalThis.indexedDB,name='kadr-recovery',timeout=8000}={}){
  let connection=null,opening=null;
  function database(){
    if(connection)return Promise.resolve(connection);
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      if(!indexedDB){reject(fault('StorageUnavailableError','Хранилище браузера недоступно.'));return;}
      let settled=false,request;
      const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);};
      const timer=setTimeout(()=>fail(fault('StorageUnavailableError','Хранилище браузера не отвечает.')),timeout);
      try{request=indexedDB.open(name,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('head');db.createObjectStore('assets',{keyPath:'id'});};
      request.onblocked=()=>fail(fault('StorageUnavailableError','Другая вкладка не даёт открыть хранилище.'));
      request.onerror=()=>fail(request.error);
      request.onsuccess=()=>{
        if(settled){request.result.close();return;}settled=true;clearTimeout(timer);connection=request.result;
        connection.onversionchange=()=>{connection?.close();connection=null;};connection.onclose=()=>{connection=null;};resolve(connection);
      };
    }).finally(()=>{opening=null;});
    return opening;
  }
  async function read(includeAssets=true){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['head','assets'],'readonly'),heads=tx.objectStore('head'),assets=tx.objectStore('assets');let record=null,error=null;
      const timer=setTimeout(()=>{error=fault('StorageUnavailableError','Хранилище браузера не отвечает.');try{tx.abort();}catch{}},timeout);
      const request=heads.get('current');request.onsuccess=()=>{
        const head=request.result;if(!head)return;
        record={head,assets:[]};
        if(!includeAssets)return;
        if(!Array.isArray(head.assetIds)||head.assetIds.some(id=>typeof id!=='string')){error=fault('RecoveryDataError','Не удалось прочитать список изображений.');tx.abort();return;}
        for(const id of head.assetIds){const r=assets.get(id);r.onsuccess=()=>{if(!r.result){error=fault('RecoveryDataError','В резервной копии не хватает изображения.');tx.abort();}else record.assets.push(r.result);};}
      };
      tx.oncomplete=()=>{clearTimeout(timer);resolve(record);};tx.onabort=()=>{clearTimeout(timer);reject(error??tx.error??fault('StorageUnavailableError','Не удалось прочитать резервную копию.'));};
    });
  }
  async function write(record,expectedToken){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['head','assets'],'readwrite'),heads=tx.objectStore('head'),assets=tx.objectStore('assets');let error=null;
      const timer=setTimeout(()=>{error=fault('StorageUnavailableError','Сохранение заняло слишком много времени.');try{tx.abort();}catch{}},timeout);
      const request=heads.get('current');request.onsuccess=()=>{
        const old=request.result;
        if((old?.token??null)!==expectedToken){error=fault('RecoveryConflictError','Резервную копию обновила другая вкладка.');tx.abort();return;}
        try{
          if(!Array.isArray(old?.assetIds)&&old)assets.clear();
          for(const asset of record.assets)assets.put(asset);
          const keep=new Set(record.head.assetIds);for(const id of Array.isArray(old?.assetIds)?old.assetIds:[])if(typeof id==='string'&&!keep.has(id))assets.delete(id);
          heads.put(record.head,'current');
        }catch(e){error=e;tx.abort();}
      };
      // Only a complete transaction is a saved copy. Aborts leave head and assets
      // from the previous commit intact, including on quota exhaustion.
      tx.oncomplete=()=>{clearTimeout(timer);resolve(record.head);};tx.onabort=()=>{clearTimeout(timer);reject(error??tx.error??fault('StorageUnavailableError','Не удалось сохранить резервную копию.'));};
    });
  }
  async function reset(){
    const db=await database();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['head','assets'],'readwrite');let error=null;
      const timer=setTimeout(()=>{error=fault('StorageUnavailableError','Сброс занял слишком много времени.');try{tx.abort();}catch{}},timeout);
      // Keep only a new token: older open tabs cannot silently restore erased
      // work, while a fresh app starts exactly like a first visit.
      const head={version:1,token:uid(),updatedAt:Date.now(),assetIds:[],reset:true};
      try{tx.objectStore('assets').clear();tx.objectStore('head').clear();tx.objectStore('head').put(head,'current');}
      catch(e){error=e;tx.abort();}
      tx.oncomplete=()=>{clearTimeout(timer);resolve(head);};
      tx.onabort=()=>{clearTimeout(timer);reject(error??tx.error??fault('StorageUnavailableError','Не удалось сбросить проект.'));};
    });
  }
  return {read,write,reset,close(){connection?.close();connection=null;}};
}
