export function validatePics(items){
 if(!Array.isArray(items)||items.length>50)throw Object.assign(new Error('PIC는 최대 50명까지 등록할 수 있습니다.'),{status:400});
 const pics=items.map(x=>({pic:String(x?.pic||'').trim(),email:String(x?.email||'').trim().toLowerCase()}));
 if(pics.some(x=>!x.pic||x.pic.length>100||/[/,;\n\r]/.test(x.pic)||x.email.length>254||(x.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)))||new Set(pics.map(x=>x.pic.toLowerCase())).size!==pics.length)throw Object.assign(new Error('중복되지 않는 PIC 이름과 올바른 이메일을 입력해 주세요.'),{status:400});
 return pics;
}
export function initialPics(project,links=[]){
 const names=project?.pics||[];
 const matches=links.filter(l=>l.projectId===project?.id);
 const email=String(project?.fields?.['현업 이메일']||'').trim().toLowerCase();
 const unambiguous=names.length===1&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/[;,]/.test(email);
 return names.map(pic=>({pic,email:matches.find(l=>l.pic===pic)?.email||(unambiguous?email:'')}));
}
export function picFields(pics){return {PIC:pics.map(x=>x.pic).join('/'),'현업 이메일':pics.map(x=>x.email).filter(Boolean).join('; ')};}
