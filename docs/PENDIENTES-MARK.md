# Lo que le toca a Mark

Todo lo que se podía hacer sin cuentas, credenciales ni decisiones de negocio ya está hecho y probado: el MVP (E0–E10), la auditoría y la cola de mejoras de antes del lanzamiento (M1–M17). Lo que queda depende de ti. Está en el orden en que conviene hacerlo; cada punto dice dónde se carga.

Detalle de cada pregunta: `docs/PREGUNTAS.md`. Detalle técnico de cada cuenta: `docs/deploy.md` y `docs/lanzamiento.md`.

## 1. Decisiones (responder antes de abrir cuentas)

- [ ] **Planes de pago para producción** (pregunta 20). Recomendado: Supabase Pro + Vercel Pro, unos USD 45 al mes con 100 solicitudes; Resend Pro (USD 20) cuando pases de ~200 solicitudes al mes. Vercel Hobby no permite uso comercial y Supabase Free se queda sin espacio en semanas. Precios de 2025: verifícalos.
- [ ] **Precios en la pantalla de aceptación** (pregunta 2): hoy solo están en el PDF.
- [ ] **¿Se cotiza fuera de Panamá?** (pregunta 13).
- [x] Resueltas el 03/10/2026: pagos en partes y tolerancia (19), ITBMS (1), tiempo de respuesta de la fábrica (23), retención (21) y qué conservar al borrar datos (22). Ver D-113 a D-116.

## 2. Cuentas (gratis o según la decisión 1)

- [ ] **Dominio** (`provenpack.com` como primera opción). DNS en Cloudflare, gratis.
- [ ] **Supabase:** proyecto de producción y otro Free para las vistas previas.
- [ ] **Vercel:** importar `mharr92-hub/CUSTOMPACKS`.
- [ ] **Resend:** cuenta y dominio verificado (SPF, DKIM, DMARC en el DNS).
- [ ] **Cloudflare Turnstile** (gratis): clave del sitio y clave secreta. Es obligatorio en producción.
- [ ] **Google Analytics 4** y **Meta Pixel** (para medir el embudo y las campañas).
- [ ] Opcional: **Sentry** (plan gratuito) para recibir los errores.
- [ ] **Almacenamiento compatible con S3** para la copia diaria de los archivos (el que elijas; ver `docs/respaldos.md`, sección 5).

## 3. Configurar y desplegar (en este orden; `docs/deploy.md`)

- [ ] Variables de entorno en Vercel: `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `DB_POOL_MAX=1`, las de Supabase, `AUTH_SECRET` y `CRON_SECRET` (al azar), `ADMIN_EMAIL`, `MAIL_FROM`, `RESEND_API_KEY`, `FACTORY_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_CONTACT_EMAIL`, las dos de Turnstile, GA4 y Meta Pixel. **Nunca** `ALLOW_LOCAL_AUTH_LINKS` ni `RATE_LIMIT_FACTOR`: el servidor no arranca.
- [ ] Aplicar la base: `pnpm db:migrate` y `pnpm db:seed` contra Supabase (con `ADMIN_EMAIL`).
- [ ] En Supabase: plantilla del enlace mágico, URLs de redirección, SMTP de Resend y **desactivar "Allow new users to sign up"**.
- [ ] Tu cuenta: `pnpm admin:invite tu-correo@…`. Al resto del equipo lo invitas desde **Panel → Usuarios**.
- [ ] Desplegar en Vercel.
- [ ] Cron cada 15 minutos (SLA, recordatorios, avisos): `pnpm cron:install` y comprobar con `pnpm cron:install --estado`.
- [ ] Límite de archivos: subirlo en Supabase (Storage → Settings) y comprobar con `pnpm check:storage`. Si te quedas en Free, baja `max_file_mb` a 50 en Configuración.
- [ ] Respaldos en GitHub: secretos `BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` (guárdala fuera de GitHub), variable `BACKUP_SCHEMAS=public`; y para los archivos, los secretos `STORAGE_S3_*` y `BACKUP_S3_*` y la variable `BACKUP_S3_BUCKET`.
- [ ] Revisar el checklist "Después de desplegar" de `docs/deploy.md`.

## 4. Contenido (Panel → Catálogo, Configuración y Plantillas)

- [ ] **Catálogo real** (PRD §20; pregunta 4): corregir `catalogo/plantilla-catalogo.csv` (ya trae lo de hoy, marcado PROVISIONAL) y cargarlo con `pnpm catalog:import`. Una página de instrucciones: `docs/CATALOGO-COMO-LLENARLO.md`.
- [ ] **Las 200 muestras** (pregunta 5): datos en `catalogo/plantilla-muestras.csv` (incluye "cliente anterior", que no se publica) y fotos escaneadas con `pnpm gallery:import <carpeta>`, que acepta PDF de varias páginas y JPG grandes.
- [ ] **Datos de pago** en Configuración: banco, tipo de cuenta, número, beneficiario y correo de comprobantes (`payment_*`); Yappy u otras formas en `payment_instructions`. Salen en el portal del pedido y en el PDF de la cotización (pregunta 9). Y el **correo del equipo** para avisos internos (pregunta 10).
- [ ] **Textos que dependen de un dato tuyo** (medios de pago, razón social y RUC, plazo con tránsito y aduana, muestras, diseño, tolerancias): lista corta en `docs/TEXTOS-POR-CONFIRMAR.md`.
- [ ] **Confirmar o cambiar los valores PROVISIONAL** de Configuración: margen, vigencia, umbral 30/45 días, SLA y horario hábil, horas del resumen de WhatsApp (preguntas 6 y 15).
- [ ] **Guardar las 23 plantillas PROVISIONAL** de correo y WhatsApp (ya corregidas: redacción, tono y variables). Al guardarlas dejan de ser provisionales (pregunta 16).
- [ ] **Formato del RFQ** que prefiere la fábrica (pregunta 7) y si el plazo incluye tránsito y aduana (pregunta 8).
- [ ] **Textos legales:** razón social, RUC, tolerancias, muestras físicas y revisión de un abogado de la política de privacidad y los términos (Ley 81; preguntas 11 y 12).
- [ ] Autorización escrita de los clientes que quieras mostrar en `/clientes` (pregunta 14).

## 5. Equipo y operación

- [ ] Quiénes cotizan y hacen seguimiento, con su rol (pregunta 18).
- [ ] Leer `docs/manual-equipo.md` (rutina diaria, WhatsApp pendientes, pagos en partes, editar la ficha, datos personales) y `docs/DEMO.md` para la demostración.

## 6. Primer mes (cuando haya datos reales)

- [ ] Decidir qué mejoras de `docs/MEJORAS.md` siguen. Las del primer mes son P-12 a P-19, P-24 a P-29, P-32 a P-34 y P-36; están ordenadas por impacto. Recomendación: primero la bandeja "Requiere acción" (P-24) y el tablero de los 11 KPI (P-32), que ya tiene los datos guardados desde el primer día.
- [ ] A los 60 días, calibrar las metas de PRD §3 con esos datos.
