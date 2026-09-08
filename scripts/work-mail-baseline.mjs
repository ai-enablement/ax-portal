import {runWorkMailCycle} from '../server/work-mail.mjs';
import {getPool,closePool} from '../server/db/pool.mjs';
try {
  await runWorkMailCycle({...process.env,PORTAL_MAIL_MODE:'baseline'});
  const result=await getPool().query(`select (select count(*)::int from agent_portal.work_mail_state) as actors,(select count(*)::int from agent_portal.work_mail_outbox) as queued`);
  console.log(JSON.stringify(result.rows[0]));
} finally {await closePool();}
