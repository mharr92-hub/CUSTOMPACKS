# Despliegue — ProvenPack

Pasos para llevar la plataforma de local a producción. **Nada de esto se ha ejecutado**: requiere cuentas y credenciales de Mark. Ningún paso obliga a contratar un plan de pago, salvo donde se indica expresamente.

## 0. Requisitos locales

- Node 20.9 o superior (probado con Node 24) y pnpm (`npm install -g pnpm`).
- No hace falta Docker: `pnpm dev` levanta un Postgres 17 embebido en `localhost:54322` con los mismos roles y funciones de Supabase que usan las migraciones (ver `docs/DECISIONES.md`, D-002).

```bash
pnpm install
cp .env.example .env.local   # opcional: completa lo que tengas
pnpm dev                     # Postgres local + migraciones + seed + next dev
```

Comandos útiles: `pnpm db:reset` (recrea la base local), `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

## 1. Supabase (base de datos, Auth y Storage)

1. Crea un proyecto en <https://supabase.com> (el plan Free sirve para empezar). Región sugerida: `us-east-1` (la más cercana a Panamá con Vercel `iad1`).
2. En **Project Settings → API** copia:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca en el navegador)
3. En **Project Settings → Database → Connection string → Transaction pooler** (puerto 6543) copia la cadena → `DATABASE_URL`. Usa `DB_POOL_MAX=1` en Vercel.
4. Aplica las migraciones con la CLI (sin Docker):
   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <ref-del-proyecto>
   pnpm dlx supabase db push          # aplica supabase/migrations
   psql "$DATABASE_URL" -f supabase/seed.sql   # datos maestros provisionales
   ```
   Luego registra el correo del administrador:
   ```sql
   insert into public.settings (key, value, value_type, description)
   values ('admin_email', '"correo@de-mark.com"', 'string', 'Correo que recibe rol admin al registrarse')
   on conflict (key) do update set value = excluded.value;
   ```
5. **Auth → URL Configuration**: `Site URL` = dominio final; agrega `https://<dominio>/auth/confirm` y la URL de preview de Vercel a *Redirect URLs*.
6. **Auth → Email Templates → Magic Link**: usa el enlace con `token_hash` para que funcione desde cualquier navegador:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}`
7. **Auth → SMTP**: configura Resend como SMTP (paso 3) para que los enlaces salgan desde el dominio propio.
8. **Storage**: los buckets privados (`artwork`, `evidence`, `documents`, `catalog`) los crean las migraciones. El plan Free limita cada archivo a 50 MB; para el límite de 100 MB por archivo del PRD hace falta el plan Pro (decisión de Mark; ver D-012).

## 2. Vercel (aplicación)

1. Importa el repositorio `mharr92-hub/CUSTOMPACKS` en <https://vercel.com/new>. Framework: Next.js; install `pnpm install --frozen-lockfile`; build `pnpm build` (ya definidos en `vercel.json`).
2. Variables de entorno (Production y Preview): todas las de `.env.example` que tengas. Mínimo para producción: `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DB_POOL_MAX=1`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` (32+ caracteres aleatorios), `ADMIN_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `MAIL_FROM`, `RESEND_API_KEY`, `FACTORY_EMAIL`.
3. Crons: `vercel.json` los declara y Vercel envía `Authorization: Bearer $CRON_SECRET`. El plan Hobby solo permite crons diarios; los recordatorios de SLA cada hora necesitan Pro (ver D-013). Sin Pro, los crons diarios siguen funcionando.
4. Despliega. Cada PR genera un preview automáticamente.

## 3. Resend (correo transaccional)

1. Crea la cuenta en <https://resend.com> y agrega el dominio.
2. Publica en el DNS los registros que indica Resend: SPF (`TXT`), DKIM (`CNAME`/`TXT`) y un registro DMARC (`_dmarc TXT "v=DMARC1; p=none; rua=mailto:..."`).
3. Crea una API key → `RESEND_API_KEY`. `MAIL_FROM` debe usar el dominio verificado (por ejemplo `ProvenPack <cotizaciones@provenpack.com>`).
4. Sin `RESEND_API_KEY` la app no falla: registra los correos como `simulated` en la tabla `notifications` y en consola.

## 4. Dominio

1. Registra el dominio (primera opción: `provenpack.com`).
2. Recomendado: DNS en Cloudflare (gratis). Apunta el dominio a Vercel (`CNAME` a `cname.vercel-dns.com` o los registros que indique Vercel) con el proxy de Cloudflare **desactivado** para esos registros.
3. En Vercel → Settings → Domains agrega el dominio; actualiza `NEXT_PUBLIC_SITE_URL` y la `Site URL` de Supabase.

## 5. Analytics y errores (opcionales)

- GA4: `NEXT_PUBLIC_GA_ID`. Meta Pixel: `NEXT_PUBLIC_META_PIXEL_ID`. Si faltan, los helpers no hacen nada.
- Sentry: `NEXT_PUBLIC_SENTRY_DSN`.
- Turnstile (captcha invisible): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`.

## 6. Verificación después de desplegar

La lista completa, verificada en local, está en la sección "Checklist de despliegue" al final de este documento (se completa en E10).
