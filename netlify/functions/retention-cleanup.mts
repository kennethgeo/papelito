import { runNetlifyScheduledRetentionEvent } from '../../src/lib/retention/cleanup';

export default async function retentionCleanupHandler(req: Request): Promise<Response> {
  const response = await runNetlifyScheduledRetentionEvent(req);
  const result = await response.clone().json();
  console.log(JSON.stringify({ job: 'retention-cleanup', status: response.status, ...result }));
  return response;
}

export const config = {
  schedule: '@daily',
};
