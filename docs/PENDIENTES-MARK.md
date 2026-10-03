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

## 3. Configurar y desplegar (`docs/deploy.md`, paso a paso)

Todo está preparado para que desplegar sea completar un archivo, pegarlo en Vercel y correr unos comandos. Cada paso de `docs/deploy.md` dice el comando exacto y cómo saber que salió bien.

- [ ] `copy .env.example .env.production` y completarlo con las claves de las cuentas. Cada variable dice dónde se obtiene y qué pasa sin ella.
- [ ] `pnpm run doctor --env .env.production --produccion` hasta que diga **0 errores**.
- [ ] Base: `pnpm db:migrate --env .env.production` y `pnpm db:seed --env .env.production`.
- [ ] Supabase: Site URL y Redirect URLs, plantilla del enlace mágico, SMTP de Resend y **desactivar "Allow new users to sign up"**.
- [ ] Previews: `pnpm supabase:preview` (muestra el plan) y `pnpm supabase:preview --ejecutar` (crea el proyecto Free y escribe `.env.preview`).
- [ ] Vercel: importar el repositorio y pegar `.env.production` (Production) y `.env.preview` (Preview) con "Import .env". Desplegar.
- [ ] Tu cuenta: `pnpm admin:invite tu-correo@… --env .env.production`. Al resto del equipo lo invitas desde **Panel → Usuarios**.
- [ ] Cron cada 15 minutos: `pnpm cron:install --env .env.production` y, a los 20 minutos, `pnpm cron:install --estado --env .env.production`.
- [ ] Límite de archivos: `pnpm check:storage --env .env.production`. Si te quedas en Free, baja `max_file_mb` a 50 en Configuración.
- [ ] Respaldos en GitHub: secretos `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE`, `STORAGE_S3_*` y `BACKUP_S3_*`, y variables `BACKUP_SCHEMAS=public` y `BACKUP_S3_BUCKET`. Luego, un run a mano.
- [ ] Checklist "Después de desplegar" (paso 11 de `docs/deploy.md`).

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
