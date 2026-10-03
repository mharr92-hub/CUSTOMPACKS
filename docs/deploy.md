# Despliegue — lista de verificación

El código está listo para producción. Desplegar consiste en tres cosas:

1. crear las cuentas (gratis, salvo los planes de la pregunta 20);
2. completar un archivo de variables y pegarlo en Vercel;
3. correr unos pocos comandos.

Cada paso dice el comando exacto y cómo saber que salió bien. Ninguno se ha ejecutado contra cuentas reales: requieren las credenciales de Mark.

Los comandos se corren en la carpeta del proyecto, en PowerShell o en la terminal de VS Code. Tiempo estimado: una tarde.

## Antes de empezar

- [ ] **Node 20.9 o superior y pnpm.**
  - Comando: `node -v` y `pnpm -v`.
  - Sale bien si: Node dice v20.9 o más (probado con v24) y pnpm responde. Si falta pnpm: `npm install -g pnpm`.
- [ ] **Dependencias.**
  - Comando: `pnpm install`.
  - Sale bien si: termina sin errores.
- [ ] **Ensayo completo del despliegue, sin cuentas.**
  - Comando: `pnpm verify:deploy`.
  - Sale bien si: termina con **"N/N comprobaciones en verde"** (hoy 34/34, ver la tabla al final). Tarda unos 3 minutos.
- [ ] **Decidir los planes** (pregunta 20).

| Servicio | Para probar | Para operar con clientes | Por qué |
| --- | --- | --- | --- |
| Supabase | Free | **Pro** (≈ USD 25/mes) | Free da 1 GB de archivos, se pausa tras 7 días sin uso y no acepta archivos de más de 50 MB |
| Vercel | Hobby | **Pro** (≈ USD 20/mes) | Hobby es solo para uso personal no comercial |
| Resend | Free (100 correos/día) | Pro (≈ USD 20/mes) pasadas ≈ 200 solicitudes/mes | El tope diario llega primero |

Precios públicos de 2025: verifícalos. Este repositorio no contrata nada.

## 1. Archivo de variables de producción

- [ ] **Crear el archivo.**
  - Comando: `copy .env.example .env.production` (en bash: `cp .env.example .env.production`).
  - Sale bien si: existe `.env.production`. Git lo ignora: nunca se sube.
- [ ] **Completarlo a medida que avances** en los pasos 2 a 6. Cada variable del archivo dice dónde se obtiene y qué pasa sin ella.
- [ ] **Revisarlo.**
  - Comando: `pnpm run doctor --env .env.production --produccion`.
  - Sale bien si: dice **"0 errores"**. Cada ✘ dice qué falta y qué deja de funcionar.
  - Ojo: es `pnpm run doctor`, porque `pnpm doctor` es un comando propio de pnpm.

## 2. Supabase (base de datos, ingreso y archivos)

- [ ] **Crear el proyecto de producción** en <https://supabase.com>, región `us-east-1`.
- [ ] **Copiar las claves al archivo.**
  - En **Project Settings → API**: `Project URL` va a `SUPABASE_URL`, `anon public` a `SUPABASE_ANON_KEY` y `service_role` a `SUPABASE_SERVICE_ROLE_KEY`.
  - En **Project Settings → Database → Connection string → Transaction pooler** (puerto 6543): la cadena, con la clave de la base, va a `DATABASE_URL`, junto con `DB_POOL_MAX=1`.
  - Sale bien si: `pnpm run doctor --env .env.production --produccion` muestra ✔ en "Base de datos" y en "Supabase".
- [ ] **Crear las tablas y cargar el catálogo inicial.**
  - Comando: `pnpm db:migrate --env .env.production` y luego `pnpm db:seed --env .env.production`. Los scripts pasan solos al Session pooler (5432).
  - Sale bien si: dice "24 migraciones aplicadas" (o las que haya) y "seed aplicado". En **Table Editor** todas las tablas figuran con RLS.
  - `db:migrate` hace un respaldo previo si la base ya tenía datos. Si falla por falta de `pg_dump`, instala PostgreSQL 17 (solo el cliente) o, la primera vez con la base vacía, agrega `--sin-respaldo`.
- [ ] **Auth → URL Configuration.**
  - `Site URL` = `https://<dominio>`.
  - *Redirect URLs*: `https://<dominio>/auth/confirm` y `https://*.vercel.app/auth/confirm`.
- [ ] **Auth → Email Templates → Magic Link.** El enlace debe ser `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}`.
- [ ] **Auth → Providers → Email.** Desactivar **"Allow new users to sign up"**. Nadie se crea cuenta solo; el equipo entra por invitación (paso 8).
- [ ] **Auth → SMTP.** Configurar el SMTP de Resend (paso 4), para que los enlaces salgan del dominio propio.
- [ ] **Storage.**
  - Las migraciones crean los buckets: `artwork`, `documents` y `evidence` son privados; `catalog` es público.
  - En Pro, sube **Storage → Settings → Upload file size limit** a 100 MB.
  - Comando: `pnpm check:storage --env .env.production`.
  - Sale bien si: los tres buckets privados aceptan `max_file_mb`. Si te quedas en Free, baja `max_file_mb` a 50 en Configuración.

## 3. Supabase para los previews (proyecto Free aparte)

Cada pull request genera un preview en Vercel. Usa su propia base: nunca toca la de producción ni manda correos reales.

- [ ] **Datos para el script.** En `.env.local` agrega:
  - `SUPABASE_ACCESS_TOKEN`: supabase.com → Account → Access Tokens;
  - `PREVIEW_SITE_URL`: por ejemplo `https://custompacks-git-main-<equipo>.vercel.app`;
  - `ADMIN_EMAIL`.
- [ ] **Ver el plan.**
  - Comando: `pnpm supabase:preview`.
  - Sale bien si: muestra los 7 pasos y "Variables completas". No cambia nada.
- [ ] **Crear el proyecto.**
  - Comando: `pnpm supabase:preview --ejecutar`.
  - Sale bien si: termina con "Listo. Pega .env.preview…". Si la organización no está en Free, se detiene antes de crear nada, para no generar cobros.
- [ ] **Revisar el archivo generado.**
  - Comando: `pnpm run doctor --env .env.preview`.
  - Sale bien si: no hay ✘. Los correos simulados y la falta de Turnstile salen como "·", y es lo esperado en previews.

## 4. Resend (correo) y dominio

- [ ] **Dominio.** Registra `provenpack.com` (primera opción) y maneja el DNS en Cloudflare (gratis).
- [ ] **Dominio en Resend.** Agrégalo y publica los registros que indica Resend: SPF, DKIM y DMARC (`_dmarc TXT "v=DMARC1; p=none; rua=mailto:…"`).
  - Sale bien si: Resend marca el dominio como **Verified**.
- [ ] **Clave y remitente.** Crea la API key (va a `RESEND_API_KEY`) y escribe `MAIL_FROM` con el dominio verificado (`ProvenPack <cotizaciones@provenpack.com>`).
- [ ] **Correo de la fábrica.** `FACTORY_EMAIL` es el correo que recibe los RFQ.

## 5. Captcha (Cloudflare Turnstile, gratis)

- [ ] **Crear el sitio.** Cloudflare → Turnstile → Add site, con el dominio. La clave del sitio va a `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y la secreta a `TURNSTILE_SECRET_KEY`.
  - Sale bien si: el doctor muestra ✔ en "Captcha". Con las claves de prueba de Cloudflare da ✘ en producción.

## 6. Secretos propios, contacto y medición

- [ ] **Dos claves al azar, distintas.** Generan `AUTH_SECRET` (32 caracteres o más) y `CRON_SECRET`.
  - Comando: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (una vez para cada una).
- [ ] **Contacto y sitio.** Completa `NEXT_PUBLIC_WHATSAPP_NUMBER` (el número real, no el de ejemplo), `NEXT_PUBLIC_CONTACT_EMAIL`, `ADMIN_EMAIL` y `NEXT_PUBLIC_SITE_URL=https://<dominio>`.
- [ ] **Opcionales:** `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` y `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] **Revisión final.**
  - Comando: `pnpm run doctor --env .env.production --produccion`.
  - Sale bien si: dice **"0 errores"**.

## 7. Vercel

- [ ] **Importar el repositorio.** Importa `mharr92-hub/CUSTOMPACKS` en <https://vercel.com/new>. `vercel.json` ya define la instalación, el build y los crons.
- [ ] **Variables de producción.** En **Settings → Environment Variables → Import .env**, pega el contenido de `.env.production`, marcando solo *Production*.
- [ ] **Variables de previews.** Mismo lugar: pega `.env.preview`, marcando solo *Preview*.
- [ ] **Desplegar.** Deployments → Redeploy.
  - Sale bien si: el build termina en verde y el sitio abre.
- [ ] **Cabeceras de seguridad.**
  - Comando: `curl -sI https://<dominio>/`.
  - Sale bien si: aparecen `content-security-policy`, `strict-transport-security` y `x-frame-options: DENY`.
- [ ] **Dominio en Vercel.** Agrégalo en **Settings → Domains**. En Cloudflare, apúntalo a Vercel (`CNAME` a `cname.vercel-dns.com`) con el proxy **desactivado**.
- [ ] **Nunca** cargues en Vercel `ALLOW_LOCAL_AUTH_LINKS`, `RATE_LIMIT_FACTOR` ni `ENABLE_ERROR_TEST_ROUTE`. Con las dos primeras, el servidor no arranca.

## 8. Tu cuenta y el equipo

- [ ] **Invitarte como admin.**
  - Comando: `pnpm admin:invite tu-correo@… --env .env.production`.
  - Sale bien si: llega el correo de invitación y, al abrirlo, entras al panel como **Administrador**.
- [ ] **El resto del equipo** se invita desde **Panel → Usuarios**.

## 9. Cron cada 15 minutos (SLA, recordatorios, avisos)

Vercel Hobby solo permite crons diarios. El frecuente lo corre Supabase Cron, sin costo.

- [ ] **Instalarlo.**
  - Comando: `pnpm cron:install --env .env.production`.
  - Sale bien si: dice "Job provenpack-avisos instalado: */15 * * * *".
- [ ] **Comprobarlo** a los 20 minutos.
  - Comando: `pnpm cron:install --estado --env .env.production`.
  - Sale bien si: aparecen corridas con estado `succeeded`.
- [ ] **Crons diarios de Vercel.** En **Vercel → Crons** figuran 3 procesos. Ejecutar uno a mano responde 200.

## 10. Respaldos (GitHub, gratis)

- [ ] **Secretos de la base.** En **GitHub → Settings → Secrets and variables → Actions** crea los secretos `BACKUP_DATABASE_URL` (Session pooler, puerto 5432) y `BACKUP_PASSPHRASE` (guárdala también fuera de GitHub), y la variable `BACKUP_SCHEMAS=public`.
- [ ] **Copia de archivos.** Crea los secretos `STORAGE_S3_*` (Supabase → Storage → Settings → S3 Connection) y `BACKUP_S3_*`, y la variable `BACKUP_S3_BUCKET` (`docs/respaldos.md`, sección 5).
- [ ] **Probarlo.** **Actions → Respaldo diario → Run workflow**.
  - Sale bien si: el run termina en verde y en *Artifacts* aparece `respaldo-…`. El trabajo "Copia de archivos" copia `artwork`, `documents` y `evidence`.
  - Prueba abrirlo una vez: `gpg --decrypt respaldo.dump.gpg > respaldo.dump`.

## 11. Después de desplegar (en producción)

- [ ] **Ingreso al panel.** Llega el enlace mágico al correo de admin y entras con rol Administrador.
- [ ] **Solicitud de prueba desde el celular:**
  - llega el correo de confirmación al cliente y el aviso al equipo;
  - el enlace de seguimiento abre y la ficha técnica (PDF) baja;
  - un archivo de arte de prueba sube con barra de progreso.
- [ ] **Medición.** GA4 (*Tiempo real*) registra la visita y *Meta Pixel Helper* muestra `PageView` y, al enviar, `Lead`.
- [ ] **Configuración.** Carga los datos de pago (banco, cuenta, beneficiario, correo de comprobantes) y el correo del equipo. En **Plantillas**, revisa y guarda los textos.
- [ ] **Limpiar la prueba.** Cierra la solicitud de prueba como **Rechazada** con motivo "Otro", para que no cuente en los reportes.
- [ ] **Criterio de salida del MVP:** una solicitud real de cada segmento (`docs/lanzamiento.md`, sección 6).

## Ensayo local: qué comprueba `pnpm verify:deploy`

El script levanta una base nueva, aplica migraciones y seed, compila con `NODE_ENV=production`, arranca `next start` y comprueba lo que sigue. No usa servicios externos.

| Área | Comprobación |
| --- | --- |
| Base | Migraciones y seed sobre una base vacía; RLS en todas las tablas |
| Copia S3 | El respaldo de archivos copia exactamente los buckets privados; cada secreto del flujo de GitHub está en `.env.example` |
| Variables | Cada variable que lee el código está documentada en `.env.example` |
| Cron | Los crons de `vercel.json` son diarios (límite de Hobby); existe `/api/cron/notifications` para Supabase Cron; `cron:install` se niega contra una base que no es de Supabase; cada cron da 401 sin `CRON_SECRET` y 200 con él |
| Previews | `pnpm supabase:preview` muestra el plan sin tocar nada; el `.env.preview` que genera no lleva Resend y usa pool 1 |
| Doctor | Un entorno de producción completo pasa; las variables de prueba y el número de WhatsApp de ejemplo fallan |
| Build | `next build` en producción, sin secretos (ni sus nombres) en el código público, incluida la clave secreta de Turnstile |
| Turnstile | Con las claves de prueba de Cloudflare, la clave del sitio llega al navegador y la CSP permite el script y el iframe |
| Páginas y cabeceras | Inicio, catálogo, galería, cotizador, legales e ingreso dan 200; CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, sin `X-Powered-By` |
| SEO | `sitemap.xml` con el dominio; `robots.txt` bloquea `/admin` y `/seguimiento` |
| Acceso | `/admin` sin sesión va al ingreso; una sesión firmada con la clave de desarrollo no entra; reportes 401; seguimiento inventado 404; archivo privado con token falso rechazado |

Resultado del 03/10/2026: **34/34 comprobaciones en verde**.
