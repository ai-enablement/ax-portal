export const splitDevelopers=value=>String(value||'').split(/[/;\n]/).flatMap(v=>/[가-힣]/.test(v)?v.split(','):[v]).map(v=>v.trim()).filter(Boolean);
export const developerKey=name=>String(name).normalize('NFKC').replace(/\((?:수석|책임|선임|팀장|팀원|매니저|과장|대리|사원)\)/g,'').replace(/\s+/g,'').toLowerCase();
export function developerOptions(projects,people=[]){
 const names=[...people,...projects.flatMap(p=>splitDevelopers(p.developer||p.fields?.['개발자']))];
 const unique=new Map();for(const name of names){const text=String(name||'').trim();if(text&&!unique.has(developerKey(text)))unique.set(developerKey(text),text);}
 return [...unique.values()].sort((a,b)=>a.localeCompare(b,'ko'));
}
