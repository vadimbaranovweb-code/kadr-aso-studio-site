import {crc32} from '../zip.js';
// Store-ready 24-bit RGB PNG. Canvas encoders may keep an alpha channel even
// when every pixel is opaque. Encode RGB explicitly and preserve every pixel.
function chunk(type,data){
  const bytes=new Uint8Array(12+data.length),view=new DataView(bytes.buffer);
  view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);
  view.setUint32(bytes.length-4,crc32(bytes.subarray(4,bytes.length-4)));return bytes;
}
export async function encodeRGBPNG(canvas){
  if(typeof CompressionStream==='undefined')throw new Error('Для экспорта нужен современный браузер. Обновите Safari, Chrome или Firefox.');
  const {width,height}=canvas,rgba=canvas.getContext('2d').getImageData(0,0,width,height).data;
  const stride=width*3+1,rows=new Uint8Array(stride*height);
  for(let y=0;y<height;y++){
    let to=y*stride;rows[to++]=1; // PNG Sub filter reduces the solid backgrounds.
    for(let x=0;x<width;x++)for(let c=0;c<3;c++){
      const at=(y*width+x)*4+c;
      rows[to++]=(rgba[at]-(x?rgba[at-4]:0)+256)&255;
    }
  }
  const compressed=new Uint8Array(await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=2;
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
