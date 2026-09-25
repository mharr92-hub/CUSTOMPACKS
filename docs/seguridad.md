# Informe de seguridad (E9)

Revisión de la plataforma contra el OWASP Top 10 (2021), al 24/09/2026. Para cada riesgo: qué protege el sistema, cómo se comprobó y qué queda pendiente. Todas las pruebas citadas corren en CI con cada commit.

## Resumen

- **RLS en todas las tablas (35 de 35).**
  - El público no lee ninguna fila fuera del catálogo activo y de los ajustes públicos.
  - Con el enlace de seguimiento, el cliente ve solo su solicitud, sin costos, precios ni montos.
  - Pruebas: `tests/db/security.test.ts` y las de cada bloque.
- **Tres problemas reales encontrados y corregidos en esta revisión:**
  1. **Clave de sesiones en producción.** Si se desplegaba sin Supabase y sin `AUTH_SECRET`, las sesiones del panel se firmaban con la clave de desarrollo, que está en el repositorio, y cualquiera podía falsificar una sesión de admin. Ahora, en producción sin `AUTH_SECRET` de 32 caracteres o más, no se firma ni se acepta ningún token. Prueba: `tests/unit/auth-secret.test.ts`.
  2. **pdf.js vulnerable (GHSA-hq66-cqwq-w95j, alta).** La vista previa de los PDF que suben los clientes usaba pdfjs-dist 5.x, que permite ejecutar JavaScript con un PDF malicioso. Se actualizó a 6.3; `pnpm audit --prod` queda sin hallazgos.
  3. **Subidas que fallaban al azar.** Los tokens base64url pueden empezar con "-" o "_" y el validador de rutas los rechazaba: cerca del 3 % de los borradores no podían subir arte y 1 de cada 32 subidas fallaba. No era una fuga, pero sí una falla de disponibilidad. Prueba: `tests/unit/storage-paths.test.ts`.
- **Se agregó:**
  - límite de intentos en todos los formularios públicos y en el ingreso al panel;
  - captcha invisible opcional (Turnstile);
  - política de contenido (CSP);
  - revisión automática de secretos en el código público;
  - respaldos diarios cifrados;
  - Sentry opcional;
  - Dependabot.

## OWASP Top 10

### A01 · Control de acceso

- **Base de datos:**
  - RLS activado en cada tabla del esquema `public`. Una prueba lista todas las tablas y falla si alguna no lo tiene o si el público lee alguna fila fuera del catálogo.
  - El cliente accede solo con su token (claim `app.access_token`) y ve solo su solicitud. Los permisos por columna le ocultan costos, márgenes, precios, montos, asignación y notas internas.
- **Roles del equipo** (`admin`, `sales`, `ops`, `viewer`):
  - Cada acción del servidor verifica el rol; el viewer solo lee (e2e E6).
  - Plantillas, usuarios y ajustes: solo admin.
  - Los archivos de arte solo los abren el equipo asignado y admin (D-048).
- **Archivos:**
  - Buckets privados; URLs firmadas de 5 a 10 minutos.
  - Cada URL se emite solo tras verificar que el archivo pertenece al pedido o a la solicitud del token.
- **Rutas:**
  - `/admin` exige sesión (proxy y verificación en cada página).
  - El CSV de reportes responde 401 sin sesión (e2e E9).
  - Los crons exigen `CRON_SECRET` con comparación en tiempo constante.
- **Estados:**
  - Las transiciones de solicitudes, cotizaciones y pedidos las valida la base con triggers.
  - La aprobación del proof y la aceptación de la cotización son inmutables.

### A02 · Fallas criptográficas

- HTTPS con HSTS (2 años, `preload`).
- Tokens de enlaces y borradores: 32 bytes aleatorios de `crypto.randomBytes`.
- Enlaces mágicos: se guarda solo su hash SHA-256; vencen en 60 minutos y se usan una sola vez.
- Sesión local: JWT HS256 en una cookie `httpOnly`, `secure` en producción y `SameSite=Lax`, que vence en 7 días. En producción exige `AUTH_SECRET` (corrección 1). Con Supabase, la sesión la maneja Supabase Auth.
- El límite de intentos guarda IP, correo y token como hash SHA-256, nunca en claro.
- Los respaldos se cifran con GPG AES-256 antes de guardarse (`docs/respaldos.md`).

### A03 · Inyección

- **SQL:** todas las consultas usan plantillas parametrizadas de postgres.js. Los únicos `unsafe` son el cambio de rol de la sesión (valor fijo) y los tipos enum del catálogo (lista cerrada del código).
- **HTML:**
  - React escapa todo.
  - Los correos escapan el texto de las plantillas y solo convierten en enlace las URLs del sistema.
  - La CSP bloquea plugins, marcos externos y `<base>` ajenos.
- **CSV:** las celdas de texto que empiezan con `=`, `+`, `-`, `@` se neutralizan (inyección de fórmulas), con prueba unitaria.
- **Archivos:** se valida el tipo real por su firma (magic bytes), no por la extensión. Un HTML renombrado a `.jpg` se rechaza y se borra.

### A04 · Diseño inseguro

- **Precios:** el portal nunca muestra precios ni montos (regla del proyecto). Están en los PDF que emite el equipo, y la base lo refuerza con permisos por columna.
- **Límite de intentos por ventana** (migración `009_security`):

  | Acción | Tope |
  | --- | --- |
  | Enviar solicitud | 20 por hora e IP |
  | Autoguardado | 600 cada 10 min por IP |
  | Enlace "seguir después" | 10 por hora e IP, y 3 por borrador al día |
  | Subidas | 200 cada 10 min por IP |
  | Acciones del portal | 60 cada 10 min por IP |
  | Ingreso al panel | 20 cada 15 min por IP y 5 cada 15 min por correo |
  | Errores reenviados a Sentry | 30 cada 10 min por IP |

- **Captcha invisible Turnstile:** opcional; se activa con `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Se carga solo en el resumen del cotizador, así que no pesa en el resto.
- **Comprobantes de pago:** hasta 5 sin revisar por pedido; un pedido cerrado no recibe más.

### A05 · Configuración insegura

- **Cabeceras en todas las respuestas:** `Content-Security-Policy` (en páginas), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, `Cross-Origin-Opener-Policy: same-origin` y HSTS. Next.js no anuncia su versión (`poweredByHeader: false`).
- **CSP:**
  - Scripts: propios, GA4, Meta Pixel y Turnstile. Nada puede incrustar el sitio (`frame-ancestors 'none'`); `object-src 'none'`.
  - El e2e de accesibilidad verifica que la CSP no bloquee nada en las páginas públicas y el cotizador.
  - Lighthouse "buenas prácticas" da 100 con la CSP activa.
- **Archivos privados:** en modo local se sirven con `Content-Security-Policy: sandbox` (salvo los PDF) y `nosniff`, y como descarga cuando se pide descargar.
- **Variables de entorno:** se validan al arrancar (zod). Los crons y el envío de enlaces de acceso en pantalla solo funcionan sin credenciales fuera de producción.

### A06 · Componentes vulnerables

- `pnpm audit --prod`: sin vulnerabilidades conocidas tras actualizar pdf.js (corrección 2).
- **Dependabot** (`.github/dependabot.yml`): revisa npm cada lunes y las acciones de GitHub cada mes.
- **Quedan 3 avisos en dependencias de desarrollo.** Vienen de Lighthouse, que solo se usa para medir y no llega al sitio:
  - `extract-zip` (sin versión corregida publicada);
  - `@opentelemetry/core`.

### A07 · Identificación y autenticación

- Sin contraseñas: el ingreso al panel es por enlace mágico de un solo uso que vence en 60 minutos.
- Solo entran correos con cuenta del equipo, y el correo de admin configurado.
- El pedido de enlaces tiene tope por IP y por correo, para que nadie use el formulario para llenar un buzón de enlaces.
- Admin puede desactivar a una persona. Su sesión deja de valer en la siguiente petición, porque cada página verifica el perfil activo.
- Con Supabase, además rigen los límites de envío de correos de Supabase Auth.

### A08 · Integridad de software y datos

- Instalación con `--frozen-lockfile` en CI. SheetJS se instala desde el paquete oficial con versión fija, registrado en el lockfile.
- Las migraciones están numeradas y versionadas.
- Auditoría con triggers (`audit_log`): quién, qué, cuándo, antes y después.
- La aprobación del proof y la aceptación de la cotización son inmutables en la base.

### A09 · Registro y monitoreo

- `audit_log`, `activities` (historial de cada solicitud) y `notifications` (cada aviso, con su texto y estado).
- `lib/log.ts` registra los errores del servidor; `instrumentation.ts` captura los errores no manejados de páginas, acciones y rutas.
- **Sentry opcional** (`NEXT_PUBLIC_SENTRY_DSN`):
  - Recibe los errores del servidor y del navegador.
  - Antes de enviar se borran tokens de enlaces, correos y contraseñas de URLs.
  - No usa el SDK de Sentry.
- Los topes alcanzados y los captchas rechazados quedan como advertencias en el log.

### A10 · SSRF

- El servidor solo llama a direcciones fijas: Resend, Turnstile, Sentry y Supabase Storage (URLs firmadas que genera el propio sistema).
- Los enlaces de referencia que escribe el cliente se guardan como texto y nunca se descargan en el servidor.
- Los PDF se arman solo con datos propios, sin imágenes remotas.

## Privacidad (datos personales)

- El servidor guarda los datos de contacto del borrador solo con consentimiento; los borradores vencidos se purgan cada día.
- Los tokens nunca van en URLs que ve la analítica:
  - La confirmación usa una cookie `httpOnly`.
  - Las páginas con token en la URL (`?borrador`, `?repetir`) no cargan GA4 ni el Pixel y limpian la barra de direcciones.
- Los archivos de arte vencidos se marcan según `artwork_retention_months`; admin confirma el borrado.

## Cómo verificarlo

```bash
pnpm test                                   # RLS en todas las tablas, límite de intentos, captcha, clave de sesión, rutas, CSV, Sentry
pnpm test:e2e                               # axe + CSP, recorrido completo, permisos del panel
pnpm build && node scripts/check-client-secrets.mjs   # sin secretos en el código público
pnpm audit --prod
curl -sI https://<dominio>/ | grep -i -E "content-security|strict-transport|x-frame"
```

## Pendiente y recomendaciones

| Tema | Estado | Qué hacer |
| --- | --- | --- |
| `'unsafe-inline'` en `script-src` | Aceptado (D-086) | Next.js necesita scripts en línea. Un nonce obligaría a renderizar cada página en cada visita y perder el cache estático. Se revisa si aparece contenido de terceros en el sitio. |
| Captcha | Apagado por defecto | Activar Turnstile (gratuito) si llega spam; el límite de intentos ya frena los envíos masivos. |
| Configuración de producción | E10 | Definir `AUTH_SECRET` (32+ caracteres), `CRON_SECRET` y las claves de Supabase. La clave de servicio solo en el servidor (la revisión de secretos lo comprueba en CI). |
| Supabase | E10 | Aplicar las migraciones con `pnpm db:migrate`, que incluyen RLS. Confirmar en el panel de Supabase que todas las tablas figuran con RLS y que los buckets `artwork`, `documents` y `evidence` son privados. |
| Respaldos | Listo, falta activar | Definir `BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` en GitHub (`docs/respaldos.md`). |
| Escaneo antivirus de archivos | Fase 2 (PRD §12) | Hoy se valida el tipo real y los archivos se sirven como descarga o en sandbox. |
