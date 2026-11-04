import { connection } from 'next/server';

// Identifies the deployed build. Never cached: the app compares it with the
// build the browser is running to detect a new deployment.
export async function GET() {
  await connection();
  return Response.json(
    { version: process.env.PAPELITO_BUILD_ID || 'desconocida' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
