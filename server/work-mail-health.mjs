const key=Symbol.for('portal.work-mail.health');
export function workerHealth(){return globalThis[key]??={status:'unknown',startedAt:null,finishedAt:null,lastSuccessAt:null,nextRetryAt:null,failures:[]};}
export function updateWorkerHealth(changes){Object.assign(workerHealth(),changes);}
const codes=new Set(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EACCES','ENOTFOUND','ERR_INVALID_URL','08000','08003','08006','08P01','28P01','42501','42P01','42703','42P18','23505','57014','57P01','53300','MAIL_RECIPIENT_INVALID','MAIL_PROJECT_LOOKUP_FAILED','MAIL_APP_URL_INVALID','MAIL_FLOW_URL_INVALID','MANAGED_IDENTITY_UNAVAILABLE','MANAGED_IDENTITY_URL_INVALID','MANAGED_IDENTITY_TOKEN_FAILED','MANAGED_IDENTITY_REQUEST_FAILED','MANAGED_IDENTITY_RESPONSE_INVALID','MANAGED_IDENTITY_TOKEN_MISSING']);
export function workerFailure(error,stage,actorId){
 const code=codes.has(error?.code)?error.code:codes.has(error?.message)?error.message:'MAIL_INTERNAL_ERROR';
 return {stage,code,...(/^\d+$/.test(String(actorId))?{actorId:String(actorId)}:{})};
}
export function reportWorkerFailure(error,stage,actorId){
 const failure=workerFailure(error,stage,actorId);
 console.error('Work mail failure',JSON.stringify(failure));
 return failure;
}
