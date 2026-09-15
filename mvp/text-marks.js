// UTF-16 ranges match native textarea selections. No HTML is stored in projects.
export function normalizedText(source){
  let text='',map=[];
  for(const token of source.matchAll(/\S+|\s+/gu)){
    if(/^\s/u.test(token[0])){if(text){text+=' ';map.push(token.index);}continue;}
    text+=token[0];for(let i=0;i<token[0].length;i++)map.push(token.index+i);
  }
  if(text.endsWith(' ')){text=text.slice(0,-1);map.pop();}return {text,map};
}
export function legacyMarks(source,phrase,color='#2563EB'){
  const {text,map}=normalizedText(source),key=normalizedText(phrase||'').text;
  if(!key)return [];const pattern=new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
  return [...text.matchAll(pattern)].map(m=>({start:map[m.index],end:map[m.index+m[0].length-1]+1,style:'text',color,radius:6}));
}
export function marksFor(copy,field){return copy[field+'Marks']?.length?copy[field+'Marks']:legacyMarks(copy[field],copy[field+'Highlight'],copy[field+'HighlightColor']);}
export function validateMarks(value,text){
  if(!Array.isArray(value)||value.length>160)throw new Error('Повреждено оформление текста.');
  let end=0;
  return value.map(m=>{
    if(!m||!Number.isInteger(m.start)||!Number.isInteger(m.end)||m.start<end||m.end<=m.start||m.end>text.length||!['text','pill'].includes(m.style)||!/^#[0-9a-f]{6}$/i.test(m.color)||typeof m.color!=='string'||!Number.isFinite(m.radius)||m.radius<0||m.radius>24)throw new Error('Повреждено оформление текста.');
    // A range cannot split a surrogate pair.
    for(const pos of [m.start,m.end])if(pos>0&&pos<text.length&&/[\uD800-\uDBFF]/.test(text[pos-1])&&/[\uDC00-\uDFFF]/.test(text[pos]))throw new Error('Повреждена граница выделения.');
    end=m.end;return {start:m.start,end:m.end,style:m.style,color:m.color,radius:m.radius};
  });
}
export function setMark(marks,start,end,decoration){
  const next=[];
  for(const m of marks){if(m.end<=start||m.start>=end)next.push({...m});else{if(m.start<start)next.push({...m,end:start});if(m.end>end)next.push({...m,start:end});}}
  if(decoration)next.push({...decoration,start,end});return next.sort((a,b)=>a.start-b.start);
}
export function editMarks(marks,before,after){
  if(before===after)return marks.map(m=>({...m}));
  let start=0,suffix=0;while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++;
  while(suffix<Math.min(before.length,after.length)-start&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
  const end=before.length-suffix,delta=after.length-before.length;
  return marks.flatMap(m=>m.end<=start?[{...m}]:m.start>=end?[{...m,start:m.start+delta,end:m.end+delta}]:[]);
}
// Map wrapped/normalized glyphs back to exact source positions, including line breaks.
export function markedLines(lines,source,marks){
  const {text,map}=normalizedText(source);let offset=0;
  return lines.map(line=>{const found=text.indexOf(line,offset);if(found>=0)offset=found;const begin=offset;offset+=line.length;
    const runs=[];let current=null;
    for(let i=0;i<line.length;i++){const m=marks.find(m=>map[begin+i]>=m.start&&map[begin+i]<m.end);if(m!==current?.mark){if(current)runs.push(current);current=m?{start:i,end:i+1,mark:m}:null;}else if(current)current.end=i+1;}
    if(current)runs.push(current);return {line,runs};
  });
}

// Reserve real horizontal space for badges, so their padding cannot cover adjacent words.
export function measureMarkedLine(ctx,line,runs){
 const segments=[];let end=0,width=0;
 const add=(text,mark=null)=>{if(!text)return;const padding=mark?.style==='pill'?8:0,glyphWidth=ctx.measureText(text).width;segments.push({text,mark,x:width+padding,width:glyphWidth,padding});width+=glyphWidth+padding*2;};
 for(const run of runs){add(line.slice(end,run.start));add(line.slice(run.start,run.end),run.mark);end=run.end;}
 add(line.slice(end));return {segments,width};
}
