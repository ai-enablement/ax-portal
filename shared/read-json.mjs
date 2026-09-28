// Retry reads only. Never replay writes or authentication/permission failures.
/** @param {string} url @param {{signal?:AbortSignal,headers?:HeadersInit,attempts?:number,timeoutMs?:number,delayMs?:number,fetcher?:typeof fetch}} options */
export async function readJson(url,{signal,headers,attempts=3,timeoutMs=12000,delayMs=500,fetcher=fetch}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(url,{method:'GET',cache:'no-store',headers,signal:controller.signal});
   if(!response.ok){const error=new Error(response.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':response.status===403?'조회 권한이 없습니다.':'조회 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.');error.status=response.status;throw error;}
   return await response.json();
  }catch(error){
   if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
   const retryable=error.name==='AbortError'||error instanceof TypeError||[408,429,500,502,503,504].includes(error.status);
   if(!retryable||attempt===attempts-1)throw error.name==='AbortError'?new Error('조회 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'):error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  await new Promise((resolve,reject)=>{
   const cancel=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
   const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},delayMs*(attempt+1));
   if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  });
 }
}
