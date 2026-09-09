import {versionView} from './version-data.js';
export const LOCALES=[['en','English'],['en-GB','English · UK'],['es-ES','Español · España'],['es-MX','Español · México'],['fr-FR','Français'],['de-DE','Deutsch'],['pt-BR','Português · Brasil'],['it-IT','Italiano'],['ru-RU','Русский'],['pl-PL','Polski'],['tr-TR','Türkçe']];
export const MAX_LOCALES=12;
export const localeLabel=code=>LOCALES.find(l=>l[0]===code)?.[1]??code;
export const validLocale=code=>LOCALES.some(l=>l[0]===code);
export function validateBrief(value={}){
  const clean={};for(const key of ['product','audience','benefits','tone','terms','claims']){
    const text=value[key]??'';if(typeof text!=='string'||text.length>2000)throw new Error('В поле контекста локализации может быть до 2000 символов.');clean[key]=text;
  }return clean;
}
export function validateLocalization(book,validateSnapshot){
  const fail=()=>{throw new Error('В файле некорректные языковые версии.');},seen=new Set();
  if(!book||!validLocale(book.source)||!Array.isArray(book.saved)||book.saved.length>=MAX_LOCALES||!Number.isSafeInteger(book.revision??0)||(book.revision??0)<0)fail();
  function meta(v){
    if(!v||!validLocale(v.code)||seen.has(v.code)||typeof v.reviewed!=='boolean'||(v.sourceStamp!==null&&(typeof v.sourceStamp!=='string'||v.sourceStamp.length>1000000)))fail();
    seen.add(v.code);return {code:v.code,reviewed:v.reviewed,sourceStamp:v.sourceStamp,view:versionView(v.view)};
  }
  const active=meta(book.active),saved=book.saved.map(v=>{
    const m=meta(v);if(v.project?.version!==5||v.project.versions!==undefined||v.project.localization!==undefined)fail();
    return {...m,project:validateSnapshot(v.project)};
  });
  if(!seen.has(book.source))fail();
  return {source:book.source,revision:book.revision??0,active,saved,brief:validateBrief(book.brief)};
}
