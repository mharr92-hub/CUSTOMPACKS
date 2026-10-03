# Despliegue — ProvenPack

Pasos para llevar la plataforma de local a producción. Los pasos con cuentas reales (Supabase, Vercel, Resend, dominio) **no se han ejecutado**: requieren credenciales de Mark. Lo que se puede comprobar sin ellas se ensaya en local con `pnpm verify:deploy` (ver el checklist al final).

## Planes para producción (decisión de Mark)

Este repositorio no contrata nada. La recomendación sale de la auditoría (`docs/AUDITORIA.md`, sección 8). Los precios son los públicos conocidos hasta 2025: verifícalos antes de contratar.

| Servicio | Para probar | Para operar con clientes | Por qué |
| --- | --- | --- | --- |
| Supabase | Free | **Pro** (≈ USD 25/mes) | Free da 1 GB de archivos y 5 GB de transferencia: con 100 solicitudes al mes se agotan en semanas. Free tampoco tiene respaldos ni acepta archivos de más de 50 MB, y se pausa tras 7 días sin uso. |
| Vercel | Hobby | **Pro** (≈ USD 20/mes, un miembro) | Hobby es solo para uso personal no comercial. |
| Resend | Free (3.000 correos/mes, 100 por día) | Free hasta ≈ 200 solicitudes/mes; luego Pro (≈ USD 20/mes) | El tope diario se alcanza primero en los días de más movimiento. |

Total estimado: unos USD 45 al mes con 100 solicitudes, y USD 65–85 con 500 a 1.000 (más el dominio). Pregunta 20 de `docs/PREGUNTAS.md`.

**Previews de Vercel:** usa un **segundo proyecto de Supabase Free** solo para Preview, sin `RESEND_API_KEY` (los correos quedan simulados) y con un `FACTORY_EMAIL` de prueba. Así un preview nunca toca la base, los archivos ni el correo de producción. En Vercel → Settings → Environment Variables, carga esas variables solo en el entorno *Preview*.

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

1. Crea un proyecto en <https://supabase.com> (Free para probar; Pro para operar, ver arriba). Región sugerida: `us-east-1` (la más cercana a Panamá con Vercel `iad1`). Crea también el proyecto Free de previews.
2. En **Project Settings → API** copia:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca en el navegador)
3. En **Project Settings → Database → Connection string → Transaction pooler** (puerto 6543) copia la cadena → `DATABASE_URL`. Usa `DB_POOL_MAX=1` en Vercel: el pooler reparte las conexiones y el código nunca abre una transacción dentro de otra (DAT-01, corregido; la CI y las pruebas e2e corren con una sola conexión).
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
7b. **Auth → Providers → Email: desactiva "Allow new users to sign up".** Nadie debe poder crearse una cuenta, y menos con el correo de admin (SEG-06). Las cuentas del equipo se crean por invitación: `pnpm admin:invite correo@de-mark.com` (rol admin) y después, desde **Panel → Usuarios**, el resto del equipo. El correo de `ADMIN_EMAIL` solo recibe el rol admin con el correo confirmado.
8. **Storage**: las migraciones crean los buckets. `artwork`, `evidence` y `documents` son privados (URLs firmadas); `catalog` es público (fotos del catálogo, D-015). El plan Free limita cada archivo a 50 MB; para el límite de 100 MB por archivo del PRD hace falta el plan Pro (decisión de Mark; ver D-012). En Pro, sube el límite global en **Storage → Settings → Upload file size limit** a 100 MB o más, y comprueba con `pnpm check:storage` (con las credenciales de producción en `.env`) que los buckets privados aceptan `max_file_mb`. Mientras siga en Free, baja `max_file_mb` a 50 en Configuración.

## 2. Vercel (aplicación)

1. Importa el repositorio `mharr92-hub/CUSTOMPACKS` en <https://vercel.com/new>. Framework: Next.js; install `pnpm install --frozen-lockfile`; build `pnpm build` (ya definidos en `vercel.json`).
2. Variables de entorno (Production y Preview): todas las de `.env.example` que tengas. Mínimo para producción: `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DB_POOL_MAX=1`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET` (32+ caracteres aleatorios; **obligatoria**: sin ella el panel no deja entrar, D-089), `ADMIN_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `MAIL_FROM`, `RESEND_API_KEY`, `FACTORY_EMAIL`, y **Turnstile** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`, gratis en Cloudflare): sin él, el panel muestra un aviso rojo porque el cotizador queda expuesto a abuso.
   - **Nunca** en producción: `ALLOW_LOCAL_AUTH_LINKS` ni `RATE_LIMIT_FACTOR` (solo para pruebas). Si están, el servidor no arranca.
3. Crons: `vercel.json` declara los crons diarios y Vercel envía `Authorization: Bearer $CRON_SECRET`.
4. **Cron cada 15 minutos (SLA, recordatorios y cola de avisos), sin pagar:** después del primer despliegue, desde tu computadora y con las variables de producción en `.env` (`DATABASE_URL` del proyecto de Supabase, `NEXT_PUBLIC_SITE_URL` y el mismo `CRON_SECRET` de Vercel):
   ```bash
   pnpm cron:install            # programa Supabase Cron: */15 * * * * → /api/cron/notifications
   pnpm cron:install --estado   # muestra el job y sus últimas corridas
   pnpm cron:install --quitar   # lo apaga
   ```
   La URL y el secreto quedan en Supabase Vault, no en el repositorio. Sin este paso, el SLA de 4 h y 24 h solo se revisa al abrir el panel y una vez al día (D-013).
5. Despliega. Cada PR genera un preview automáticamente, con las variables del entorno *Preview* (el proyecto de Supabase de pruebas).

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
- [ ] `pnpm cron:install --estado` muestra el job `provenpack-avisos` activo y corridas con estado `succeeded`.
- [ ] GA4 (*Tiempo real*) registra la visita; *Meta Pixel Helper* muestra `PageView` y, al enviar, `Lead`.
- [ ] En **Configuración**: instrucciones de pago y correo del equipo. En **Plantillas**: textos revisados.
- [ ] Respaldos activados (sección 6) y primer artefacto descargado y abierto con `gpg --decrypt`.
- [ ] La solicitud de prueba queda **Rechazada** con motivo "Otro", para que no cuente en los reportes de conversión.
- [ ] Criterio de salida del MVP con una solicitud real de cada segmento (`docs/lanzamiento.md`, sección 6).
