// Reglas de `pnpm doctor` (Bloque 4): por cada servicio, si está configurado,
// si el valor tiene buena forma y qué deja de funcionar sin él. Sin red ni
// base: solo lee las variables. Lógica pura para poder probarla.

/** Valores de ejemplo de .env.example que no deben llegar a producción. */
export const EXAMPLE_VALUES = {
  NEXT_PUBLIC_WHATSAPP_NUMBER: "50760000000",
};

const has = (env, key) => typeof env[key] === "string" && env[key].trim() !== "";
const val = (env, key) => (env[key] ?? "").trim();

/**
 * @typedef {"ok" | "warn" | "missing" | "error"} Status
 * @typedef {{ service: string; status: Status; detail: string; impact: string; vars: string[] }} Finding
 * @param {Record<string, string | undefined>} env
 * @param {{ production: boolean }} opts
 * @returns {Finding[]}
 */
export function diagnose(env, { production }) {
  /** @type {Finding[]} */
  const out = [];
  // En producción, lo que falta y es necesario es un error; en local, solo se informa.
  const need = production ? "error" : "missing";
  const add = (service, vars, status, detail, impact = "") => out.push({ service, vars, status, detail, impact });

  // Sitio
  const site = val(env, "NEXT_PUBLIC_SITE_URL");
  if (!site) add("Sitio", ["NEXT_PUBLIC_SITE_URL"], need, "sin URL pública", "los enlaces de correos, WhatsApp, PDF y sitemap apuntan a localhost");
  else if (production && !/^https:\/\/[^/]+$/.test(site.replace(/\/$/, "")))
    add("Sitio", ["NEXT_PUBLIC_SITE_URL"], "error", `${site} debe ser https://dominio, sin ruta`, "enlaces rotos en correos y PDF");
  else if (production && /localhost|127\.0\.0\.1/.test(site)) add("Sitio", ["NEXT_PUBLIC_SITE_URL"], "error", "apunta a localhost", "enlaces rotos en correos y PDF");
  else add("Sitio", ["NEXT_PUBLIC_SITE_URL"], "ok", site);

  // Base de datos
  const db = val(env, "DATABASE_URL");
  if (!db) add("Base de datos", ["DATABASE_URL"], need, "sin DATABASE_URL", production ? "la app no tiene base: no funciona nada" : "usa el Postgres embebido local (pnpm dev)");
  else if (!/^postgres(ql)?:\/\//.test(db)) add("Base de datos", ["DATABASE_URL"], "error", "no es una cadena postgres://", "la app no conecta");
  else {
    const port = db.match(/:(\d+)\//)?.[1];
    const pool = Number(val(env, "DB_POOL_MAX") || 5);
    if (production && port !== "6543") add("Base de datos", ["DATABASE_URL"], "warn", `puerto ${port ?? "?"}: en Vercel usa el Transaction pooler (6543)`, "con muchas visitas se agotan las conexiones");
    else if (production && pool !== 1) add("Base de datos", ["DB_POOL_MAX"], "warn", `DB_POOL_MAX=${pool}: en Vercel va 1`, "con muchas visitas se agotan las conexiones del pooler");
    else add("Base de datos", ["DATABASE_URL", "DB_POOL_MAX"], "ok", `${db.replace(/:\/\/[^@]*@/, "://…@").slice(0, 60)} · pool ${pool}`);
  }

  // Supabase Auth + Storage
  const sb = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const sbCount = sb.filter((k) => has(env, k)).length;
  if (sbCount === 0)
    add("Supabase (ingreso y archivos)", sb, need, "sin claves", production ? "nadie entra al panel y los archivos se guardan en un disco que Vercel borra" : "enlace mágico en consola y archivos en .data/storage");
  else if (sbCount < 3) add("Supabase (ingreso y archivos)", sb, "error", `faltan ${sb.filter((k) => !has(env, k)).join(", ")}`, "se usa el modo local: ingreso y archivos no funcionan en producción");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(val(env, "SUPABASE_URL"))) add("Supabase (ingreso y archivos)", ["SUPABASE_URL"], "warn", "SUPABASE_URL no parece https://<ref>.supabase.co", "");
  else if (val(env, "SUPABASE_ANON_KEY") === val(env, "SUPABASE_SERVICE_ROLE_KEY")) add("Supabase (ingreso y archivos)", sb, "error", "anon y service_role son la misma clave", "permisos equivocados");
  else add("Supabase (ingreso y archivos)", sb, "ok", val(env, "SUPABASE_URL"));

  // Sesiones del panel
  const auth = val(env, "AUTH_SECRET");
  if (!auth) add("Sesiones del panel", ["AUTH_SECRET"], need, "sin AUTH_SECRET", production ? "el panel no deja entrar a nadie" : "usa una clave de desarrollo");
  else if (auth.length < 32) add("Sesiones del panel", ["AUTH_SECRET"], "error", `${auth.length} caracteres (mínimo 32)`, "el panel no deja entrar");
  else add("Sesiones del panel", ["AUTH_SECRET"], "ok", `${auth.length} caracteres`);

  // Administrador
  const admin = val(env, "ADMIN_EMAIL");
  if (!admin) add("Administrador", ["ADMIN_EMAIL"], need, "sin ADMIN_EMAIL", "nadie recibe el rol admin ni los avisos internos si falta el correo del equipo");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin)) add("Administrador", ["ADMIN_EMAIL"], "error", "no es un correo", "");
  else add("Administrador", ["ADMIN_EMAIL"], "ok", admin);

  // Cron
  const cron = val(env, "CRON_SECRET");
  if (!cron) add("Tareas programadas", ["CRON_SECRET"], need, "sin CRON_SECRET", "no corren el SLA, los recordatorios, la retención ni la purga de borradores");
  else if (cron.length < 24) add("Tareas programadas", ["CRON_SECRET"], "error", `${cron.length} caracteres (mínimo 24)`, "pnpm cron:install no lo acepta");
  else if (cron === auth) add("Tareas programadas", ["CRON_SECRET"], "error", "igual a AUTH_SECRET", "usa dos claves distintas");
  else add("Tareas programadas", ["CRON_SECRET"], "ok", "listo; falta pnpm cron:install tras desplegar");

  // Correo
  const from = val(env, "MAIL_FROM");
  if (!has(env, "RESEND_API_KEY"))
    add("Correo (Resend)", ["RESEND_API_KEY", "MAIL_FROM"], need, "sin RESEND_API_KEY", "los correos quedan simulados: ni clientes ni equipo reciben avisos");
  else if (!val(env, "RESEND_API_KEY").startsWith("re_")) add("Correo (Resend)", ["RESEND_API_KEY"], "warn", "la clave no empieza con re_", "");
  else if (!from || !/<[^@\s]+@[^>\s]+>|^[^@\s]+@[^@\s]+$/.test(from)) add("Correo (Resend)", ["MAIL_FROM"], "error", "MAIL_FROM sin correo", "Resend rechaza los envíos");
  else add("Correo (Resend)", ["RESEND_API_KEY", "MAIL_FROM"], "ok", `${from} (el dominio debe estar verificado en Resend)`);

  // Fábrica
  if (!has(env, "FACTORY_EMAIL"))
    add("Fábrica", ["FACTORY_EMAIL"], production ? "warn" : "missing", "sin FACTORY_EMAIL", "el RFQ no sale por correo (se marca enviado a mano) y no hay recordatorio a la fábrica");
  else add("Fábrica", ["FACTORY_EMAIL"], "ok", val(env, "FACTORY_EMAIL"));

  // WhatsApp y contacto
  const wa = val(env, "NEXT_PUBLIC_WHATSAPP_NUMBER");
  if (!wa) add("WhatsApp", ["NEXT_PUBLIC_WHATSAPP_NUMBER"], need, "sin número", "los botones de WhatsApp llevan al número de ejemplo (+507 6000-0000)");
  else if (!/^\d{8,15}$/.test(wa)) add("WhatsApp", ["NEXT_PUBLIC_WHATSAPP_NUMBER"], "error", "solo dígitos con código de país (507…)", "los botones de WhatsApp fallan");
  else if (wa === EXAMPLE_VALUES.NEXT_PUBLIC_WHATSAPP_NUMBER) add("WhatsApp", ["NEXT_PUBLIC_WHATSAPP_NUMBER"], production ? "error" : "warn", "es el número de ejemplo", "los clientes escriben a un número que no es tuyo");
  else add("WhatsApp", ["NEXT_PUBLIC_WHATSAPP_NUMBER"], "ok", `+${wa}`);
  if (!has(env, "NEXT_PUBLIC_CONTACT_EMAIL")) add("Correo de contacto", ["NEXT_PUBLIC_CONTACT_EMAIL"], production ? "warn" : "missing", "sin correo público", "la política de privacidad y el contacto no muestran correo");
  else add("Correo de contacto", ["NEXT_PUBLIC_CONTACT_EMAIL"], "ok", val(env, "NEXT_PUBLIC_CONTACT_EMAIL"));

  // Turnstile
  const ts = ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"];
  const tsCount = ts.filter((k) => has(env, k)).length;
  if (tsCount === 0) add("Captcha (Turnstile)", ts, need, "sin claves", "el cotizador queda expuesto a envíos automáticos; el panel muestra un aviso rojo");
  else if (tsCount === 1) add("Captcha (Turnstile)", ts, "error", `falta ${ts.find((k) => !has(env, k))}`, "con solo una de las dos, el cotizador rechaza los envíos o no protege");
  else if (production && /^[123]x0+/.test(val(env, "NEXT_PUBLIC_TURNSTILE_SITE_KEY"))) add("Captcha (Turnstile)", ts, "error", "son las claves de prueba de Cloudflare", "no protege nada");
  else add("Captcha (Turnstile)", ts, "ok", "configurado");

  // Medición y errores (opcionales)
  add("Google Analytics 4", ["NEXT_PUBLIC_GA_ID"], has(env, "NEXT_PUBLIC_GA_ID") ? (/^G-[A-Z0-9]+$/.test(val(env, "NEXT_PUBLIC_GA_ID")) ? "ok" : "warn") : "missing", has(env, "NEXT_PUBLIC_GA_ID") ? val(env, "NEXT_PUBLIC_GA_ID") : "opcional", has(env, "NEXT_PUBLIC_GA_ID") ? "" : "no se mide el embudo del cotizador");
  add("Meta Pixel", ["NEXT_PUBLIC_META_PIXEL_ID"], has(env, "NEXT_PUBLIC_META_PIXEL_ID") ? (/^\d{10,20}$/.test(val(env, "NEXT_PUBLIC_META_PIXEL_ID")) ? "ok" : "warn") : "missing", has(env, "NEXT_PUBLIC_META_PIXEL_ID") ? val(env, "NEXT_PUBLIC_META_PIXEL_ID") : "opcional", has(env, "NEXT_PUBLIC_META_PIXEL_ID") ? "" : "las campañas de Meta no ven los envíos");
  add("Sentry", ["NEXT_PUBLIC_SENTRY_DSN"], has(env, "NEXT_PUBLIC_SENTRY_DSN") ? "ok" : "missing", has(env, "NEXT_PUBLIC_SENTRY_DSN") ? "configurado" : "opcional", has(env, "NEXT_PUBLIC_SENTRY_DSN") ? "" : "los errores solo quedan en los logs de Vercel");

  // Variables de prueba
  const testVars = ["ALLOW_LOCAL_AUTH_LINKS", "RATE_LIMIT_FACTOR", "ENABLE_ERROR_TEST_ROUTE"].filter((k) => has(env, k));
  if (testVars.length) add("Variables de prueba", testVars, production ? "error" : "warn", testVars.join(", "), production ? "quítalas: con ALLOW_LOCAL_AUTH_LINKS o RATE_LIMIT_FACTOR el servidor no arranca, y ENABLE_ERROR_TEST_ROUTE publica una página de error de prueba" : "solo para pruebas");

  // Respaldos (secretos de GitHub; solo se revisan si están en este archivo)
  const backup = ["BACKUP_DATABASE_URL", "BACKUP_PASSPHRASE"];
  const s3 = ["STORAGE_S3_ENDPOINT", "STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY", "BACKUP_S3_ENDPOINT", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY", "BACKUP_S3_BUCKET"];
  if (backup.every((k) => has(env, k))) add("Respaldo de la base", backup, "ok", "listo para cargar como secretos de GitHub");
  else add("Respaldo de la base", backup, "missing", "se cargan como secretos de GitHub", "sin ellos no hay respaldo diario de la base");
  const s3Count = s3.filter((k) => has(env, k)).length;
  if (s3Count === s3.length) add("Copia de archivos (S3)", s3, "ok", "listo para cargar en GitHub");
  else if (s3Count > 0) add("Copia de archivos (S3)", s3, "error", `faltan ${s3.filter((k) => !has(env, k)).join(", ")}`, "la copia diaria de archivos no corre");
  else add("Copia de archivos (S3)", s3, "missing", "se cargan en GitHub", "sin ellos no hay copia diaria del arte, evidencias y documentos");

  return out;
}

export const STATUS_ICON = { ok: "✔", warn: "!", missing: "·", error: "✘" };
