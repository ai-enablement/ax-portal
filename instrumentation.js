export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs') {
    const {startWorkMailWorker}=await import('./server/work-mail.mjs');
    startWorkMailWorker();
    const {startRpaMailWorker}=await import('./server/rpa-mail.mjs');
    startRpaMailWorker();
  }
}
