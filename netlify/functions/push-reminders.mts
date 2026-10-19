import { Pool } from '@neondatabase/serverless';
import { createPushService } from '../../src/lib/notifications/delivery';
export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let body;
  try { body = await req.json(); } catch { return new Response('Bad scheduled event', { status: 400 }); }
  if (!body.next_run || Number.isNaN(new Date(body.next_run).getTime())) return new Response('Bad scheduled event', { status: 400 });
  // Netlify scheduled functions have no public HTTP invocation in production.
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const service = createPushService(async <T,>(sql: string, params?: unknown[]) => {
      const r = await pool.query(sql, params); return { rows: r.rows as T[], rowCount: r.rowCount || 0 };
    });
    const result = await service.sendDueReminders();
    console.log(JSON.stringify({ job: 'push-reminders', ...result }));
    return Response.json(result);
  } finally { await pool.end(); }
}
export const config = { schedule: '0 * * * *' };
