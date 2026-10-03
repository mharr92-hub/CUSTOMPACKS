#!/usr/bin/env node
// `pnpm admin:invite correo@dominio.com [admin|sales|ops|viewer]`: invita a una
// persona del equipo en el proyecto de Supabase y le fija el rol (M15, SEG-06).
// Así ninguna cuenta se crea sola desde el formulario de ingreso: el registro
// público de Supabase se deja cerrado (docs/deploy.md).
// Lee SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL y NEXT_PUBLIC_SITE_URL de .env.
import { argsWithoutEnv, connect, loadEnvFiles } from "./lib/pg-local.mjs";

await loadEnvFiles();
const [email, role = "admin"] = argsWithoutEnv();
const out = (m) => process.stdout.write(`${m}\n`);
const fail = (m) => {
  process.stderr.write(`[invitar] ${m}\n`);
  process.exit(1);
};
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Uso: pnpm admin:invite correo@dominio.com [admin|sales|ops|viewer]");
if (!["admin", "sales", "ops", "viewer"].includes(role)) fail(`Rol desconocido: ${role}`);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, NEXT_PUBLIC_SITE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DATABASE_URL) {
  fail("Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL. En local no hace falta: entra con ADMIN_EMAIL desde /admin/ingresar o invita desde Panel → Usuarios.");
}
const base = SUPABASE_URL.replace(/\/$/, "");
const site = (NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const res = await fetch(`${base}/auth/v1/invite`, {
  method: "POST",
  headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ email: email.toLowerCase(), redirect_to: site ? `${site}/auth/confirm?next=/admin` : undefined }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) fail(`Supabase rechazó la invitación (${res.status}): ${body.msg ?? body.message ?? JSON.stringify(body)}`);
const userId = body.id ?? body.user?.id;
const sql = connect(DATABASE_URL);
try {
  const rows = await sql`update public.profiles set role = ${role}::public.app_role where user_id = ${userId} returning email`;
  if (!rows.length) fail("La cuenta se creó pero no tiene perfil: revisa que las migraciones estén aplicadas.");
  if (role === "admin") await sql`
    insert into public.settings (key, value, value_type, description, is_public)
    values ('admin_email', ${JSON.stringify(email.toLowerCase())}::jsonb, 'string', 'Correo del administrador', false)
    on conflict (key) do nothing`;
} finally {
  await sql.end({ timeout: 5 });
}
out(`Invitación enviada a ${email} con rol ${role}. El correo trae el enlace para entrar.`);
