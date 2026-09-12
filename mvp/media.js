import {encodeRGBPNG} from './png.js';
export function loadImage(source){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Не удалось прочитать изображение. Попробуйте PNG или JPG.'));image.src=source;});}
export async function readScreenshot(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(`${file.name}: нужен PNG, JPG или WebP.`);
  if(file.size>20*1024*1024)throw new Error(`${file.name}: максимум 20 МБ на изображение.`);
  const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось открыть файл.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});
  const image=await loadImage(source);
  if(image.naturalHeight<=image.naturalWidth)throw new Error(`${file.name}: выберите вертикальный экран телефона.`);
  if(image.naturalHeight*image.naturalWidth>32e6)throw new Error(`${file.name}: разрешение больше 32 мегапикселей.`);
  return {source,image,width:image.naturalWidth,height:image.naturalHeight};
}
export function suggestColors(image){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,32,32);
  const pixels=ctx.getImageData(0,0,32,32).data,buckets=new Map();
  for(let i=0;i<pixels.length;i+=4){const color=[pixels[i],pixels[i+1],pixels[i+2]],hi=Math.max(...color),lo=Math.min(...color);if(pixels[i+3]<230||hi-lo<35||hi<60)continue;const key=color.map(c=>Math.round(c/32)*32).join(',');const b=buckets.get(key)||{sum:[0,0,0],count:0};b.count++;color.forEach((c,j)=>b.sum[j]+=c);buckets.set(key,b);}
  const best=[...buckets.values()].sort((a,b)=>b.count-a.count)[0];if(!best)return null;
  const base=best.sum.map(c=>c/best.count),tint=amount=>'#'+base.map(c=>Math.round(c+(255-c)*amount).toString(16).padStart(2,'0')).join('');
  return [tint(.83),tint(.55)];
}
export function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export const pngBlob=encodeRGBPNG;
