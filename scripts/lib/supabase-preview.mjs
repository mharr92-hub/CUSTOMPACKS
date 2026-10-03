// Partes puras de `pnpm supabase:preview` (plan, variables para Vercel Preview
// y configuración de Auth), separadas para poder probarlas sin red.

export const API = "https://api.supabase.com/v1";
export const DEFAULT_REGION = "us-east-1";
export const DEFAULT_NAME = "provenpack-previews";

/** Pasos que hace el script, en orden (se muestran en modo prueba). */
export function previewPlan({ name, region, org, reuseRef }) {
  return [
    `Revisar que la organización ${org || "(la única de tu cuenta)"} esté en el plan Free: si no, se detiene para no generar cobros.`,
    reuseRef ? `Usar el proyecto existente ${reuseRef} (no se crea ninguno).` : `Crear el proyecto Free "${name}" en ${region} con una clave de base nueva al azar.`,
    "Esperar a que el proyecto quede activo (2 a 5 minutos).",
    "Leer la URL, la clave anon, la service_role y las cadenas del pooler.",
    "Aplicar las migraciones (pnpm db:migrate) y el seed (pnpm db:seed) por el Session pooler.",
    "Configurar Auth: Site URL y Redirect URLs de los previews, registro público desactivado y plantilla del enlace mágico con token_hash.",
    "Escribir .env.preview con las variables para Vercel → Settings → Environment Variables → Preview (sin RESEND_API_KEY: los correos quedan simulados).",
  ];
}

/** Configuración de Auth del proyecto de previews (PATCH /projects/{ref}/config/auth). */
export function previewAuthConfig({ siteUrl, redirectPatterns }) {
  return {
    site_url: siteUrl,
    uri_allow_list: redirectPatterns.join(","),
    disable_signup: true,
    mailer_subjects_magic_link: "Tu enlace de acceso (previews)",
    mailer_templates_magic_link_content:
      '<p>Entra con este enlace:</p><p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}">Entrar</a></p>',
  };
}

/**
 * Contenido de .env.preview: lo que se pega en Vercel (entorno Preview). Nunca
 * lleva RESEND_API_KEY ni datos de producción.
 */
export function previewEnvFile({ supabaseUrl, anonKey, serviceRoleKey, transactionUrl, adminEmail, siteUrl, authSecret, cronSecret }) {
  const lines = [
    "# Variables para Vercel → Settings → Environment Variables → solo Preview.",
    "# Generado por pnpm supabase:preview. No lo subas al repositorio (.env* está en .gitignore).",
    `NEXT_PUBLIC_SITE_URL=${siteUrl}`,
    `DATABASE_URL=${transactionUrl}`,
    "DB_POOL_MAX=1",
    `SUPABASE_URL=${supabaseUrl}`,
    `SUPABASE_ANON_KEY=${anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    `AUTH_SECRET=${authSecret}`,
    `CRON_SECRET=${cronSecret}`,
    `ADMIN_EMAIL=${adminEmail}`,
    "FACTORY_EMAIL=fabrica-pruebas@example.com",
    "# Sin RESEND_API_KEY: en los previews los correos quedan simulados (tabla notifications).",
  ];
  return `${lines.join("\n")}\n`;
}

/** Elige las cadenas del pooler: Session (5432) para migrar, Transaction (6543) para la app. */
export function poolerUrls(pooler, dbPassword) {
  const list = Array.isArray(pooler) ? pooler : [pooler];
  const withPass = (s) => s.replace("[YOUR-PASSWORD]", encodeURIComponent(dbPassword));
  const tx = list.find((p) => p.pool_mode === "transaction") ?? list[0];
  if (!tx?.connection_string) throw new Error("Supabase no devolvió la cadena del pooler.");
  const transactionUrl = withPass(tx.connection_string);
  const sessionUrl = transactionUrl.replace(/:6543\//, ":5432/");
  return { transactionUrl, sessionUrl };
}
