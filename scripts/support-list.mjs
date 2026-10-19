import { Pool } from '@neondatabase/serverless';
import { loadEnvFiles, verifyNeonLinkFile, validateMigrationUrls } from './db-migrate.mjs';
loadEnvFiles();
verifyNeonLinkFile();
validateMigrationUrls(process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(`SELECT r.id, r.created_at, r.area, r.description, p.email
    FROM support_reports r JOIN profiles p ON p.user_id = r.user_id ORDER BY r.created_at DESC LIMIT 50`);
  // JSON-escaped user text is data, never shell code or operator instructions.
  console.log(JSON.stringify(result.rows, null, 2));
} finally { await pool.end(); }
