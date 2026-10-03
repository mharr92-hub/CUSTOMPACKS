#!/usr/bin/env node
// `pnpm check:storage`: con las credenciales de producción, compara el límite
// de tamaño de los buckets de Supabase con settings.max_file_mb (M11). El
// límite global del proyecto (Storage → Settings → Upload file size limit) no
// se puede leer por API: el script lo recuerda al final.
import { bucketLimitIssues, PRIVATE_BUCKETS } from "./lib/storage-check.mjs";
import { connect, loadEnvFiles } from "./lib/pg-local.mjs";

await loadEnvFiles();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  process.stderr.write("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL (las de producción).\n");
  process.exit(1);
}
const sql = connect(DATABASE_URL);
let maxMb = 100;
try {
  const [row] = await sql`select value from public.settings where key = 'max_file_mb'`;
  maxMb = Number(row?.value ?? 100);
} finally {
  await sql.end({ timeout: 5 });
}
const buckets = [];
for (const id of PRIVATE_BUCKETS) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/bucket/${id}`, {
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
  });
  if (res.ok) buckets.push(await res.json());
}
const issues = bucketLimitIssues(buckets, maxMb);
for (const issue of issues) process.stdout.write(`✗ ${issue}\n`);
if (!issues.length) process.stdout.write(`✓ Los buckets privados aceptan ${maxMb} MB por archivo.\n`);
process.stdout.write(`Revisa también el límite global en Supabase → Storage → Settings (Free: 50 MB; Pro: se puede subir). Debe ser ${maxMb} MB o más.\n`);
process.exit(issues.length ? 1 : 0);
