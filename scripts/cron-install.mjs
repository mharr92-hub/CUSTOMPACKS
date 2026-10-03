#!/usr/bin/env node
// `pnpm cron:install`: programa en Supabase Cron (pg_cron + pg_net, incluidos en
// el plan gratuito) una llamada a /api/cron/notifications cada 15 minutos (M6).
// Así el SLA de 4 h y 24 h, los recordatorios y la cola de avisos corren sin
// que nadie abra el panel y sin contratar el cron frecuente de Vercel.
//
// Lee DATABASE_URL (conexión directa o Session pooler del proyecto de Supabase),
// NEXT_PUBLIC_SITE_URL y CRON_SECRET del entorno o de .env. La URL y el secreto
// se guardan en Supabase Vault: no quedan en el repositorio ni en el texto del job.
//
// Uso:
//   pnpm cron:install            instala o actualiza el job
//   pnpm cron:install --estado   muestra el job y sus últimas corridas
//   pnpm cron:install --quitar   lo desinstala
import { connect, isSupabaseDatabase, loadEnvFiles } from "./lib/pg-local.mjs";

const JOB = "provenpack-avisos";
const SCHEDULE = "*/15 * * * *";
const out = (m) => process.stdout.write(`${m}\n`);
const fail = (m) => {
  process.stderr.write(`[cron] ${m}\n`);
  process.exit(1);
};

await loadEnvFiles();
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;
if (!url) fail("Falta DATABASE_URL: este comando se corre contra el proyecto de Supabase (docs/deploy.md, paso de Supabase Cron).");

const sql = connect(url);
try {
  if (!(await isSupabaseDatabase(sql))) fail("DATABASE_URL no es un proyecto de Supabase. En local, el panel y el cron diario ya corren los procesos.");

  if (args.has("--quitar")) {
    await sql`select cron.unschedule(jobid) from cron.job where jobname = ${JOB}`;
    out(`Job ${JOB} desinstalado.`);
  } else if (args.has("--estado")) {
    const jobs = await sql`select jobid, schedule, active from cron.job where jobname = ${JOB}`;
    if (!jobs.length) out(`No hay job ${JOB}. Instálalo con pnpm cron:install.`);
    for (const j of jobs) out(`Job ${JOB}: ${j.schedule} · ${j.active ? "activo" : "inactivo"}`);
    const runs = jobs.length
      ? await sql`select status, start_time, return_message from cron.job_run_details where jobid = ${jobs[0].jobid} order by start_time desc limit 5`
      : [];
    for (const r of runs) out(`  ${r.start_time.toISOString()} · ${r.status} ${r.return_message ?? ""}`);
  } else {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const secret = process.env.CRON_SECRET || "";
    if (!/^https:\/\//.test(site)) fail("NEXT_PUBLIC_SITE_URL debe ser la URL pública https del sitio en Vercel.");
    if (secret.length < 24) fail("Falta CRON_SECRET (24 caracteres o más), el mismo que tiene Vercel.");

    await sql`create extension if not exists pg_cron with schema pg_catalog`;
    await sql`create extension if not exists pg_net with schema extensions`;
    await saveSecret(sql, "provenpack_cron_url", `${site}/api/cron/notifications`);
    await saveSecret(sql, "provenpack_cron_secret", secret);
    const command = `
      select net.http_get(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'provenpack_cron_url'),
        headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'provenpack_cron_secret')),
        timeout_milliseconds := 60000
      )`;
    await sql`select cron.schedule(${JOB}, ${SCHEDULE}, ${command})`;
    out(`Job ${JOB} instalado: ${SCHEDULE} → ${site}/api/cron/notifications`);
    out("Revisa las corridas con: pnpm cron:install --estado");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await sql.end({ timeout: 5 });
}

async function saveSecret(db, name, value) {
  const [existing] = await db`select id from vault.secrets where name = ${name}`;
  if (existing) await db`select vault.update_secret(${existing.id}, ${value})`;
  else await db`select vault.create_secret(${value}, ${name})`;
}
