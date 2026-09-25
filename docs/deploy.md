# Despliegue — ProvenPack

Pasos para llevar la plataforma de local a producción. Los pasos con cuentas reales (Supabase, Vercel, Resend, dominio) **no se han ejecutado**: requieren credenciales de Mark. Lo que se puede comprobar sin ellas se ensaya en local con `pnpm verify:deploy` (ver el checklist al final). Ningún paso obliga a contratar un plan de pago, salvo donde se indica expresamente.

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
4. Aplica las migraciones y los datos iniciales. Usa la conexión directa o *Session pooler* (puerto 5432), no la de transacción. Desde la carpeta del proyecto:
   ```bash
   DATABASE_URL="postgres://postgres.<ref>:<clave>@<host>:5432/postgres" pnpm db:migrate
   DATABASE_URL="postgres://postgres.<ref>:<clave>@<host>:5432/postgres" ADMIN_EMAIL="correo@de-mark.com" pnpm db:seed
   ```
   - `db:migrate` reconoce que la base es de Supabase y **no** aplica el shim local; `db:reset` se niega a correr contra Supabase (D-094).
   - El seed carga el catálogo PROVISIONAL y registra el correo de admin; se puede repetir sin duplicar.
   - Alternativa con la CLI de Supabase: `pnpm dlx supabase link --project-ref <ref>` y luego `pnpm dlx supabase db push`. Usa la misma tabla de migraciones, así que se pueden combinar.
5. **Auth → URL Configuration**: `Site URL` = dominio final; agrega `https://<dominio>/auth/confirm` y la URL de preview de Vercel a *Redirect URLs*.
6. **Auth → Email Templates → Magic Link**: usa el enlace con `token_hash` para que funcione desde cualquier navegador:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}`
7. **Auth → SMTP**: configura Resend como SMTP (paso 3) para que los enlaces salgan desde el dominio propio.
8. **Storage**: las migraciones crean los buckets. `artwork`, `evidence` y `documents` son privados (URLs firmadas); `catalog` es público (fotos del catálogo, D-015). El plan Free limita cada archivo a 50 MB; para el límite de 100 MB por archivo del PRD hace falta el plan Pro (decisión de Mark; ver D-012).

## 2. Vercel (aplicación)

1. Importa el repositorio `mharr92-hub/CUSTOMPACKS` en <https://vercel.com/new>. Framework: Next.js; install `pnpm install --frozen-lockfile`; build `pnpm build` (ya definidos en `vercel.json`).
2. Variables de entorno (Production y Preview): todas las de `.env.example` que tengas. Mínimo para producción: `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DB_POOL_MAX=1`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` (32+ caracteres aleatorios; **obligatoria**: sin ella el panel no deja entrar, D-089), `ADMIN_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `MAIL_FROM`, `RESEND_API_KEY`, `FACTORY_EMAIL`.
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

Para generar `AUTH_SECRET` y `CRON_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 6. Respaldos

Define los secretos `BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` en GitHub (`docs/respaldos.md`). Luego corre una vez **Actions → Respaldo diario → Run workflow** y confirma que aparece el artefacto.

## Checklist de despliegue

### A. Ensayo local (sin cuentas): `pnpm verify:deploy`

El script levanta una base nueva, aplica migraciones y seed, compila con `NODE_ENV=production` y las variables mínimas, revisa que no haya secretos en el código público, arranca `next start` y comprueba lo que sigue.

| Paso | Comprobación | Resultado (25/09/2026) |
| --- | --- | --- |
| Base de datos | 9 migraciones y seed sobre una base vacía; RLS en las 35 tablas | ✔ |
| Build | `next build` en modo producción | ✔ |
| Secretos | Ni `AUTH_SECRET` ni `CRON_SECRET` (ni sus nombres) en los 246 archivos públicos | ✔ |
| Páginas | Inicio, catálogo, galería, cotizador, legales e ingreso responden 200 | ✔ |
| Cabeceras | CSP con `frame-ancestors 'none'`, HSTS, `X-Frame-Options: DENY`, `nosniff`, sin `X-Powered-By` | ✔ |
| SEO | `sitemap.xml` con el dominio de `NEXT_PUBLIC_SITE_URL`; `robots.txt` bloquea `/admin` y `/seguimiento` | ✔ |
| Acceso | `/admin` sin sesión va al ingreso; una sesión firmada con la clave de desarrollo no entra; el CSV de reportes da 401 sin sesión | ✔ |
| Enlaces | Un enlace de seguimiento inventado da 404; un archivo privado con token falso se rechaza | ✔ |
| Crons | Los 3 de `vercel.json` dan 401 sin `CRON_SECRET` y 200 con él | ✔ |

Resultado: **23/23 comprobaciones en verde**. Correr de nuevo antes de cada despliegue importante.

### B. Cuentas (Mark)

- [ ] **Supabase:**
  - proyecto creado y claves copiadas (paso 1);
  - migraciones y seed aplicados;
  - en *Table Editor*, todas las tablas figuran con RLS;
  - en *Storage*, `artwork`, `documents` y `evidence` son privados.
- [ ] **Auth de Supabase:** Site URL, Redirect URLs, plantilla del enlace mágico con `token_hash` y SMTP de Resend (pasos 1.5 a 1.7).
- [ ] **Resend:** dominio verificado (SPF, DKIM, DMARC) y API key.
- [ ] **Vercel:** proyecto importado y variables de Production y Preview cargadas, con `AUTH_SECRET` y `CRON_SECRET` nuevas, distintas de las de prueba.
- [ ] **Dominio** apuntando a Vercel, con `NEXT_PUBLIC_SITE_URL` y la Site URL de Supabase actualizadas.

### C. Después de desplegar (en producción)

- [ ] `curl -sI https://<dominio>/` muestra `content-security-policy`, `strict-transport-security` y `x-frame-options: DENY`.
- [ ] Ingreso al panel: llega el enlace mágico al correo de admin y entra con rol Administrador.
- [ ] Solicitud de prueba desde el celular:
  - llega el correo de confirmación al cliente y el aviso al equipo;
  - el enlace de seguimiento abre y la ficha técnica (PDF) baja;
  - un archivo de arte de prueba sube con barra de progreso (máximo 50 MB en Supabase Free, D-012).
- [ ] **Vercel → Crons** muestra los 3 procesos. Ejecutar uno a mano responde 200.
- [ ] GA4 (*Tiempo real*) registra la visita; *Meta Pixel Helper* muestra `PageView` y, al enviar, `Lead`.
- [ ] En **Configuración**: instrucciones de pago y correo del equipo. En **Plantillas**: textos revisados.
- [ ] Respaldos activados (sección 6) y primer artefacto descargado y abierto con `gpg --decrypt`.
- [ ] La solicitud de prueba queda **Rechazada** con motivo "Otro", para que no cuente en los reportes de conversión.
- [ ] Criterio de salida del MVP con una solicitud real de cada segmento (`docs/lanzamiento.md`, sección 6).
