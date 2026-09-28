import {isRpaRunDay} from './rpa-display.mjs';
export const RPA_DAYS=['월','화','수','목','금','토','일'];
export function applySchedulePreset(fields,selected){
 return {...fields,...Object.fromEntries(RPA_DAYS.map(d=>[d,selected.includes(d)?'O':''])),주기:selected.length?'일':'',실행일:selected.length===7?'매일':selected.length?'주중':''};
}
export const timeKey=day=>`${day} 실행 시간`;
export const validTimes=value=>typeof value==='string'&&(!value.trim()||/^([01]?\d|2[0-3]):[0-5]\d(?:\s*,\s*([01]?\d|2[0-3]):[0-5]\d)*$/.test(value.trim()));
// Parse only unambiguous day/range clauses. Never assign uncertain legacy prose to a day.
export function dayTimes(fields={}){
 const out=Object.fromEntries(RPA_DAYS.map(d=>[d,'']));
 const raw=String(fields['실행 시간']||'').trim();
 if(validTimes(raw)){for(const d of RPA_DAYS)if(isRpaRunDay(fields[d]))out[d]=raw;}
 const pattern=/([월화수목금토일])(?:요일)?\s*(?:[~～–-]\s*([월화수목금토일])(?:요일)?)?\s*[:：]?\s*((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*,\s*(?:[01]?\d|2[0-3]):[0-5]\d)*)/g;
 for(const m of raw.matchAll(pattern)){
  const start=RPA_DAYS.indexOf(m[1]),end=RPA_DAYS.indexOf(m[2]||m[1]);
  if(end<start)continue;
  for(let i=start;i<=end;i++)if(isRpaRunDay(fields[RPA_DAYS[i]]))out[RPA_DAYS[i]]=m[3];
 }
 for(const d of RPA_DAYS){if(Object.hasOwn(fields,timeKey(d)))out[d]=String(fields[timeKey(d)]||'');if(!isRpaRunDay(fields[d]))out[d]='';}
 return out;
}
export function scheduleSummary(fields){
 const times=dayTimes(fields);
 return RPA_DAYS.filter(d=>isRpaRunDay(fields[d])).map(d=>`${d}: ${times[d]||'시간 미등록'}`).join('\n');
}
