export function validateBackgroundAsset(asset,accountBytes=()=>{}){
 if(asset==null)return null;
 if(typeof asset.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(asset.image)||asset.image.length>30*1024*1024)throw new Error('Повреждено изображение фона.');
 if(!Number.isInteger(asset.width)||!Number.isInteger(asset.height)||asset.width<1||asset.height<1||asset.width*asset.height>32e6)throw new Error('Повреждены размеры фона.');
 accountBytes(asset.image);return {image:asset.image,width:asset.width,height:asset.height};
}
export function drawBackgroundImage(ctx,image,w,h){
 if(!image)throw new Error('Фон ещё не загружен. Откройте проект заново.');
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,k=Math.max(w/iw,h/ih);
 ctx.drawImage(image,(w-iw*k)/2,(h-ih*k)/2,iw*k,ih*k);
}
