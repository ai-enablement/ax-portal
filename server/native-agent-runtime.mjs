import {spawn} from 'node:child_process';
import {resolve,delimiter} from 'node:path';
export function nativeAgentEnvironment(env=process.env){
 return {...env,PYTHONPATH:[resolve('server/vendor/intake-agent/python-packages'),env.PYTHONPATH].filter(Boolean).join(delimiter),PORTAL_AGENT_EMBEDDED:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'};
}
export function runNativeAgent(packet,{env=process.env}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(/* turbopackIgnore: true */ env.PORTAL_AGENT_PYTHON || 'python3',['server/vendor/intake-agent/portal_bridge.py'],{windowsHide:true,env:nativeAgentEnvironment(env),stdio:['pipe','pipe','pipe']});
  let output='';
  child.stdout.setEncoding('utf8');
  const timer=setTimeout(()=>{child.kill();reject(new Error('Agent response timeout'));},120000);
  child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(Buffer.byteLength(output)>12*1024*1024){child.kill();reject(new Error('Agent response too large'));}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('Python Agent runtime is unavailable'));});
  child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Python Agent execution failed'));try{resolve(JSON.parse(output));}catch{reject(new Error('Invalid Agent response'));}});
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify(packet));
 });
}
