import {createRecoveryCodec} from './recovery-store.js';
const clone=value=>Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clone(v)])):value;

export function recoveryMessage(error){
  if(error?.name==='QuotaExceededError')return 'В браузере не хватает места. Скачай текущий проект в файл.';
  if(error?.name==='RecoveryConflictError')return 'Копию обновила другая вкладка. Автосохранение здесь приостановлено, чтобы не затереть её работу.';
  return error?.message||'Не удалось сохранить резервную копию. Скачай проект в файл.';
}

export function createAutosave({store,getSnapshot,restore,onState=()=>{},delay=650,maxWait=3000,validate}){
  if(typeof validate!=='function')throw new TypeError('A project validator is required.');
  const codec=createRecoveryCodec();let token=null,generation=0,savedGeneration=0,ready=false,blocked=false,flight=null,timer=null,maxTimer=null;
  let state={status:'loading',savedAt:null,error:null,mode:null,pending:false};
  const report=patch=>{state={...state,...patch,pending:generation!==savedGeneration};onState({...state});};
  const clearTimers=()=>{clearTimeout(timer);clearTimeout(maxTimer);timer=maxTimer=null;};
  function fail(error,mode='write'){blocked=true;report({status:error?.name==='RecoveryConflictError'?'conflict':'error',error:recoveryMessage(error),mode});}
  async function start(){
    try{
      const record=await store.read();
      if(record?.head?.reset===true&&record.head.version===1&&typeof record.head.token==='string'&&record.head.token){
        token=record.head.token;ready=true;report({status:'idle',savedAt:null,error:null,mode:null});return false;
      }
      if(record){const snapshot=codec.unpack(record);snapshot.project=validate(snapshot.project);await restore(snapshot);token=record.head.token;ready=true;report({status:'saved',savedAt:record.head.updatedAt,error:null,mode:null});return true;}
      ready=true;report({status:'idle',error:null,mode:null});return false;
    }catch(error){ready=true;fail(error,'load');return false;}
  }
  function changed(){
    generation++;if(blocked||!ready){report({});return;}
    report({status:flight?'saving':'pending',error:null});
    clearTimeout(timer);timer=setTimeout(()=>flush(),delay);
    if(!maxTimer)maxTimer=setTimeout(()=>flush(),maxWait);
  }
  function flush(){
    clearTimers();
    if(flight)return flight;
    if(!ready||blocked||generation===savedGeneration)return Promise.resolve(false);
    flight=(async()=>{
      while(generation!==savedGeneration&&!blocked){
        const version=generation;report({status:'saving',error:null});
        try{
          const snapshot=clone(getSnapshot());
          // Validate before replacing the last good copy. Validation preserves
          // layer order; view selection is stored as indices, not transient IDs.
          snapshot.project=validate(snapshot.project);
          const record=codec.pack(snapshot);await store.write(record,token);
          token=record.head.token;codec.accept(record.head);savedGeneration=version;
          report({status:generation===version?'saved':'saving',savedAt:record.head.updatedAt,error:null,mode:null});
        }catch(error){fail(error);return false;}
      }
      return true;
    })().finally(()=>{flight=null;if(!blocked&&generation!==savedGeneration)timer=setTimeout(()=>flush(),0);});
    return flight;
  }
  async function retry(){
    if(flight)await flight;
    if(state.mode==='load'||state.status==='conflict')return false;
    blocked=false;return flush();
  }
  async function useCurrent(){
    if(flight)await flight;
    clearTimers();blocked=true;report({status:'saving',error:null});
    try{
      // Explicit user action: replace the local recovery slot with this tab's
      // project. A subsequent race still fails the atomic token comparison.
      const record=await store.read(false);token=record?.head?.token??null;codec.reset();ready=true;blocked=false;generation++;return flush();
    }catch(error){fail(error,'load');return false;}
  }
  return {start,changed,flush,retry,useCurrent,getState:()=>({...state}),hasUnsaved:()=>generation!==savedGeneration,dispose:()=>{clearTimers();store.close?.();}};
}
