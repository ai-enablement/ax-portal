import {execFileSync,spawnSync} from 'node:child_process';

// GitHub Azure OIDC session only; never writes App Settings to disk or logs.
// Intentionally reads only the three AI values into this process environment.
function azure(args) {
  try {return JSON.parse(execFileSync('az',[...args,'--only-show-errors','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024}));}
  catch {throw new Error('Azure preflight cannot read ax-portal configuration with the current deployment identity.');}
}
try {
  const apps=azure(['webapp','list','--query',"[?name=='ax-portal'].{name:name,resourceGroup:resourceGroup}"]);
  if(apps.length!==1)throw new Error('Expected exactly one existing ax-portal Web App.');
  const settings=azure(['webapp','config','appsettings','list','--name','ax-portal','--resource-group',apps[0].resourceGroup]);
  const env={...process.env,PORTAL_TEST_AZURE_AI:'1'};
  for(const key of ['AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_API_KEY','AZURE_OPENAI_DEPLOYMENT']) {
    const value=settings.find(s=>s.name===key)?.value;
    if(!value||value.startsWith('@Microsoft.KeyVault('))throw new Error(key+' is missing or needs Key Vault reference resolution; deployment stopped.');
    env[key]=value;
  }
  const run=spawnSync(process.execPath,['--test','tests/intake-agent-live.test.mjs'],{env,stdio:'inherit'});
  if(run.status!==0)throw new Error('Live Azure AI preflight failed; production deployment stopped.');
  console.log('Azure INT/FEA preflight passed. No App Settings changed.');
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
