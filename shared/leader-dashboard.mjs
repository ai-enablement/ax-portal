export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export const calendarDays = (start,end) => Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
export function fiscalRange(year) { return {start:`${year-1}-11-01`,end:`${year}-10-31`}; }
export function scheduleStatus(project,today) {
  if(project.manualProgress===100)return 'done';
  if(validDay(project.end)&&project.end<today)return 'late';
  if(validDay(project.start)&&project.start>today)return 'plan';
  return validDay(project.start)?'prog':'unknown';
}
export function dashboardSummary(projects,range,today) {
  const dated=projects.filter(p=>validDay(p.start)&&validDay(p.end)&&p.end>=p.start);
  const scoped=dated.filter(p=>p.start<=range.end&&p.end>=range.start);
  const weighted=scoped.filter(p=>typeof p.manualProgress==='number'&&Number.isFinite(p.manualProgress)&&p.manualProgress>=0&&p.manualProgress<=100);
  const weight=weighted.reduce((n,p)=>n+calendarDays(p.start,p.end),0);
  return {scoped,missingDates:projects.length-dated.length,missingProgress:scoped.length-weighted.length,
    progress:weight?Math.round(weighted.reduce((n,p)=>n+p.manualProgress*calendarDays(p.start,p.end),0)/weight):null,
    elapsed:validDay(range.start)&&validDay(range.end)&&range.end>=range.start?Math.max(0,Math.min(100,Math.round(calendarDays(range.start,today)/calendarDays(range.start,range.end)*100))):null};
}
export function validateProgressChange(change) {
  if(!change||typeof change.percent!=='number'||!Number.isInteger(change.percent)||change.percent<0||change.percent>100)throw Error('진척률은 0~100 사이의 정수로 입력해 주세요.');
  if('start' in change||'developmentStartDate' in change||'receivedDate' in change)throw Error('최초 접수일은 기존 접수 정보에서 자동 연결되며 진척률 입력에서 변경할 수 없습니다.');
  if(typeof change.note!=='string'||change.note.length>2000)throw Error('진척 메모는 2,000자 이내로 입력해 주세요.');
  return {percent:change.percent,note:change.note.trim()};
}
