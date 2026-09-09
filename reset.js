import {createRecoveryStore} from './recovery-store.js';

const button=document.getElementById('reset-confirm');
const status=document.getElementById('reset-status');
const store=createRecoveryStore();
button.addEventListener('click',async()=>{
  if(button.disabled)return;
  button.disabled=true;status.classList.remove('error');status.textContent='Сбрасываем данные этого браузера…';
  try{
    await store.reset();store.close();
    status.textContent='Данные сброшены. Открываем студию…';
    window.location.replace(new URL('./',import.meta.url).href);
  }catch(error){
    status.textContent=error?.message||'Не удалось сбросить данные. Попробуй ещё раз.';
    status.classList.add('error');button.disabled=false;
  }
});
