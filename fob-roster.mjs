// Text-based OFD FOB print layout, two 360-point columns on US Letter landscape.
const ranks = {ENG:'Eng', ENE:'Eng', ENP:'Eng', LTE:'Lt', LTP:'Lt', FFE:'FF', FFP:'FF'};
const titles = {E:'Engine',T:'Tower',R:'Rescue',HR:'Heavy Rescue',HAZ:'Hazmat',M:'Medic',AC:'Division',D:'District',EMS:'EMS'};
function intervals(times) {
  if(times.length!==2)throw Error('A roster time entry is incomplete. Review the original PDF.');
  const minute=value=>{const [h,m]=value.split(':').map(Number);return (h*60+m+960)%1440};
  const start=minute(times[0]),end=minute(times[1]);
  if(end===0)return [[start,1440]];
  if(end>start)return [[start,end]];
  if(start===end)throw Error('Ambiguous shift times: '+times.join('–'));
  return [[0,end],[start,1440]];
}
export function parseFOB(pages, knownUnits={}) {
  const header=pages[0]?.map(t=>t.s).join(' ')||'';
  const date=header.match(/City of Orlando Fire Department Roster:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if(!date)throw Error('Use a text-based City of Orlando Fire Department FOB roster PDF.');
  const units={},members=[],warnings=new Set(),excluded=new Set(),rovers=new Set();
  let unit='',last=null, summary=false;
  for(const [page,items] of pages.entries()){
    if(items.some(t=>t.s==='Kelly Day')&&items.some(t=>t.s.startsWith('Sick Leave'))){summary=true;break}
    if(!items.some(t=>t.s.includes('Fire Department Roster:')))throw Error('Unrecognized roster page '+(page+1));
    for(const offset of [0,360]){
      const cells=items.filter(t=>t.y>47&&t.x>=offset+15&&t.x<offset+360).map(t=>({...t,x:t.x-offset})).sort((a,b)=>a.y-b.y||a.x-b.x);
      const lines=[];
      for(const t of cells){const line=lines.at(-1);if(line&&Math.abs(t.y-line[0].y)<1)line.push(t);else lines.push([t])}
      for(const line of lines){
        line.sort((a,b)=>a.x-b.x);
        const first=line[0],text=line.map(t=>t.s).join(' '),label=first.s;
        const heading=label.match(/^(DIV|ORSA|AC|EMS|D|E|R|T|M|HAZ|HR)\s*(\d*)\s*(?:-\s*District\s*(\d+))?$/i);
        if(first.x<21&&heading){
          const prefix=heading[1].toUpperCase(),num=Number(heading[2]);
          unit=prefix==='DIV'&&num===1&&page===0?'DIV1 Rovers':prefix==='ORSA'&&page===0?'ORSA':titles[prefix]&&num?titles[prefix]+' '+num:'';
          last=null;
          if(unit&&unit!=='ORSA')units[unit]=knownUnits[unit]||{region:heading[3]?'D-'+heading[3]:'',station:/^[ERT]$/.test(prefix)?'Station '+(num===101?1:num):unit};
          continue;
        }
        if(first.x<21){
          const name=line.filter(t=>t.x>=40&&t.x<100).map(t=>t.s).join(' ');
          if(!name){unit='';last=null;warnings.add('Review unrecognized heading: '+label);continue}
          if(!unit)throw Error('Member outside a recognized unit on page '+(page+1)+': '+name);
          if(unit==='ORSA'){excluded.add(name);last=null;continue}
          if(!ranks[label]&&!/^(AC|DC|CV)[A-Z]*$/.test(label))throw Error('Review unrecognized rank '+label+' for '+name);
          const qual=[...new Set(line.filter(t=>t.x>=100&&t.x<186).map(t=>t.s).join('').replace(/[^A-Za-z]/g,'').replace(/M/g,''))];
          if(['ENP','LTP','FFP','CVP','DCP','ACPM'].includes(label))qual.push('M');
          last={unit,name,rankCode:label,rank:ranks[label]||'Unknown',qual,plus:[],minus:[]};members.push(last);
        }
        if(!last)continue;
        const times=text.match(/\b\d{1,2}:\d{2}\b/g)||[];
        const side=line.filter(t=>t.x>=180).map(t=>t.s).join(' ');
        if(side&&times.length){
          const code=side.trim().split(/\s+/).at(-1).toUpperCase();
          const offCode=code==='TS-'?'STO':code;
          if(!['STO','VAC','SICKEX','SICKEXU','PERLV','MILLV','KD'].includes(offCode))throw Error('Unrecognized timed exception for '+last.name+': '+side);
          last.minus.push(...intervals(times).map(([a,b])=>[a,b,offCode]));
        }
        else if(label==='TS+'||label==='OT'){
          const code=label==='OT'?'OT':'STW';
          last.plus.push(...intervals(times).map(([a,b])=>[a,b,code]));
        }else if(/\bECS\b/.test(text))warnings.add(last.name+' · '+last.unit+' — review ECS annotation.');
        else if(times.length&&first.x<21)throw Error('Unrecognized hours for '+last.name);
      }
    }
  }
  const grades=new Map();
  for(const m of members){
    const key=m.name.toLowerCase();
    if(!grades.has(key))grades.set(key,new Set());
    grades.get(key).add(m.rankCode);
  }
  const records=[];
  for(const m of members){
    const sharedName=grades.get(m.name.toLowerCase()).size>1;
    if(sharedName)warnings.add('Verify members with the same printed name: '+m.name+'. Listed separately by printed rank code.');
    const spans=m.plus.length?m.plus:[[0,1440,'REG']];
    const points=[...new Set([0,1440,...spans.flatMap(s=>s.slice(0,2)),...m.minus.flatMap(s=>s.slice(0,2))])].sort((a,b)=>a-b);
    for(let i=1;i<points.length;i++){
      const start=points[i-1],end=points[i],on=spans.find(([a,b])=>a<=start&&start<b);
      const off=m.minus.find(([a,b])=>a<=start&&start<b);
      if(!off&&!on)continue;
      records.push({unit:m.unit,id:'fob-'+m.name.toLowerCase()+(sharedName?'@'+m.rankCode:''),name:m.name,rank:m.rank,qual:m.qual,inferred:false,
        code:off?off[2]:on[2],start,end,reportedHours:(end-start)/60,sourceFrom:(start+480)%1440,sourceThrough:(end+480)%1440});
    }
  }
  if(!records.some(r=>r.rank!=='Unknown'))throw Error('No field personnel found in the FOB roster.');
  if(summary)warnings.add('Leave totals on the summary page do not identify apparatus vacancies. Review Kelly Day hiring holds.');
  // An abbreviated name cannot safely identify two people working simultaneously.
  const byId=new Map();
  for(const r of records.filter(r=>['REG','OT','STW'].includes(r.code))){
    const prev=byId.get(r.id)||[];
    if(prev.some(p=>p.start<r.end&&r.start<p.end))throw Error('Overlapping entries for '+r.name+'. Use the TeleStaff XLSX to resolve identity or hours.');
    prev.push(r);byId.set(r.id,prev);
  }
  for(const rows of byId.values()){
    const duty=rows.filter(r=>r.unit==='DIV1 Rovers');if(!duty.length)continue;
    const time=n=>String((8+Math.floor(n/60))%24).padStart(2,'0')+String(n%60).padStart(2,'0');
    const full=duty.length===1&&duty[0].start===0&&duty[0].end===1440;
    rovers.add(duty[0].name+(full?'':' ('+duty.map(r=>time(r.start)+'–'+time(r.end)).join(', ')+')'));
  }
  return {date:date[1].padStart(2,'0')+'/'+date[2].padStart(2,'0')+'/'+date[3],units,records,warnings:[...warnings],fob:{rovers:[...rovers],excluded:[...excluded]}};
}
export async function readFOB(file,knownUnits){
  const pdf=await import('./vendor/pdf.min.mjs');
  pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
  const doc=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:false}).promise;
  try{
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const page=await doc.getPage(i),v=page.getViewport({scale:1});
      if(Math.abs(v.width-792)>4||Math.abs(v.height-612)>4)throw Error('Expected the landscape letter FOB roster layout.');
      pages.push((await page.getTextContent()).items.filter(t=>t.str?.trim()).map(t=>({x:t.transform[4],y:v.height-t.transform[5],s:t.str.trim()})));
    }
    return parseFOB(pages,knownUnits);
  }finally{await doc.destroy()}
}
