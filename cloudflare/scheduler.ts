import { Pool } from '@neondatabase/serverless';
import { runStandaloneRetentionTransaction } from '../src/lib/retention/cleanup';
import { createPushService } from '../src/lib/notifications/delivery';

interface SchedulerEnv {
  DATABASE_URL: string;
  INVITATION_TOKEN_SECRET: string;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  RETENTION_DRY_RUN?: string;
}

// Cron-only Worker: no public HTTP endpoint. Times in Cloudflare config are UTC.
const scheduler = {
  async scheduled(event: { cron: string; scheduledTime: number }, env: SchedulerEnv): Promise<void> {
    if (!env.DATABASE_URL) throw new Error('Falta DATABASE_URL para las tareas programadas.');
    if (event.cron === '0 6 * * *') {
      const result = await runStandaloneRetentionTransaction({
        referenceNow: new Date(event.scheduledTime),
        dryRun: env.RETENTION_DRY_RUN === 'true',
      }, env.DATABASE_URL);
      console.log(JSON.stringify({ job: 'retention-cleanup', eligibleCount: result.eligibleCount, deletedCount: result.deletedCount }));
      return;
    }
    if (event.cron !== '0 * * * *') throw new Error('Cron no configurado para Papelito.');
    if (!env.INVITATION_TOKEN_SECRET && !(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY)) {
      throw new Error('Falta configurar las claves Web Push.');
    }
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
    try {
      const service = createPushService(async <T,>(sql: string, params?: unknown[]) => {
        const r = await pool.query(sql, params);
        return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
      });
      const result = await service.sendDueReminders();
      console.log(JSON.stringify({ job: 'push-reminders', ...result }));
    } finally {
      await pool.end();
    }
  },
};
export default scheduler;
