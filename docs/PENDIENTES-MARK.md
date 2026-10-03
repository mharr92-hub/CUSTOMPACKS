# Lo que le toca a Mark

Todo lo que se podía hacer sin cuentas, sin catálogo real y sin decisiones de negocio ya está hecho y probado:

- el MVP (E0–E10), la auditoría y las mejoras M1–M17;
- las decisiones del 03/10/2026 (D-113 a D-116);
- las plantillas del catálogo y la importación de escaneos;
- la revisión de textos;
- el despliegue preparado para pegar variables.

Lo que queda depende de ti. Está **ordenado por lo que más desbloquea**: cada grupo dice qué destraba.

Detalle de cada pregunta: `docs/PREGUNTAS.md`. Pasos y comandos del despliegue: `docs/deploy.md`.

## 1. Elegir los planes y registrar el dominio

**Desbloquea:** todas las cuentas y, con ellas, el despliegue, los correos reales, el ingreso al panel y los respaldos.

- [ ] **Planes para producción** (pregunta 20). Recomendado:
  - Supabase Pro + Vercel Pro: unos USD 45 al mes con 100 solicitudes;
  - Resend Pro (USD 20) cuando pases de unas 200 solicitudes al mes.
  - Vercel Hobby no permite uso comercial, y Supabase Free se queda sin espacio en semanas.
  - Son precios de 2025: verifícalos.
- [ ] **Dominio** (`provenpack.com` como primera opción), con DNS en Cloudflare (gratis).

## 2. Abrir las cuentas y desplegar (`docs/deploy.md`)

**Desbloquea:** el sitio en línea, los correos a clientes y al equipo, el panel con usuarios reales y el cron cada 15 minutos.

- [ ] **Cuentas:**
  - Supabase: producción y un proyecto Free para previews;
  - Vercel;
  - Resend, con el dominio verificado;
  - Cloudflare Turnstile (gratis y obligatorio);
  - GA4 y Meta Pixel;
  - opcional, Sentry.
- [ ] **Variables.** `copy .env.example .env.production`, completarlo y revisarlo con `pnpm run doctor --env .env.production --produccion` hasta que diga **0 errores**.
- [ ] **Base.** `pnpm db:migrate --env .env.production` y `pnpm db:seed --env .env.production`. En Supabase: Site URL y Redirect URLs, plantilla del enlace mágico, SMTP de Resend y **desactivar "Allow new users to sign up"**.
- [ ] **Previews.** `pnpm supabase:preview --ejecutar`: crea el proyecto Free y escribe `.env.preview`.
- [ ] **Vercel.** Importar el repositorio y pegar `.env.production` (Production) y `.env.preview` (Preview) con "Import .env". Desplegar.
- [ ] **Tu cuenta.** `pnpm admin:invite tu-correo@… --env .env.production`.
- [ ] **Cron.** `pnpm cron:install --env .env.production` y, a los 20 minutos, `pnpm cron:install --estado --env .env.production`.
- [ ] **Archivos.** `pnpm check:storage --env .env.production`. En Free, baja `max_file_mb` a 50.
- [ ] **Después de desplegar:** checklist del paso 11 de `docs/deploy.md`.

## 3. Datos para atender al primer cliente

**Desbloquea:** cobrar el anticipo y que el cliente pueda escribirte. Sin esto, el portal y la cotización dicen "pídelos por WhatsApp" y los botones llevan a un número de ejemplo.

- [ ] **Número de WhatsApp real** (`NEXT_PUBLIC_WHATSAPP_NUMBER`) y **correo de contacto** (`NEXT_PUBLIC_CONTACT_EMAIL`).
- [ ] **Datos de pago** en Configuración (pregunta 9):
  - banco, tipo de cuenta, número, beneficiario y correo de comprobantes (`payment_*`);
  - Yappy u otras formas, en `payment_instructions`.
  - Salen en el portal del pedido y en el PDF de la cotización.
- [ ] **Correos.** El de la fábrica (`FACTORY_EMAIL`) y el del equipo para los avisos internos (`team_notification_email`, pregunta 10).
- [ ] **Plazos que chocan.** La cotización se promete en 24 horas hábiles y la fábrica tiene 48 para responder. Acuerda con la fábrica un plazo menor (Configuración → `factory_sla_hours`) o cambia la promesa al cliente.

## 4. Catálogo real y fotos

**Desbloquea:** que el sitio muestre el catálogo y las fotos reales (hoy es una propuesta de ejemplo) y que los RFQ lleven los códigos reales de la fábrica.

- [ ] **Catálogo real** (PRD §20; pregunta 4). Corregir `catalogo/plantilla-catalogo.csv`, que ya trae lo de hoy, y cargarlo:
  - primero `pnpm catalog:import catalogo/plantilla-catalogo.csv --prueba`;
  - luego, sin `--prueba`.
  - Instrucciones en una página: `docs/CATALOGO-COMO-LLENARLO.md`.
- [ ] **Las 200 muestras** (pregunta 5).
  - Datos en `catalogo/plantilla-muestras.csv`. El "cliente anterior" no se publica.
  - Fotos escaneadas: `pnpm gallery:import <carpeta>`. Acepta PDF de varias páginas y JPG grandes, y asigna los códigos por nombre o con `--orden`.
- [ ] **Formato del RFQ** que prefiere la fábrica (pregunta 7).

## 5. Textos legales y de negocio

**Desbloquea:** quitar "Documento en revisión legal" de las páginas legales y dejar de depender de supuestos en los términos.

- [ ] **Lista corta** en `docs/TEXTOS-POR-CONFIRMAR.md`:
  - razón social y RUC;
  - medios de pago;
  - si el plazo incluye tránsito y aduana (pregunta 8);
  - muestras físicas, diseño de arte y tolerancias (pregunta 12);
  - entregas fuera de Panamá (pregunta 13).
- [ ] **Revisión de un abogado** de la política de privacidad y los términos (Ley 81; pregunta 11).
- [ ] **Autorización escrita** de los clientes que quieras mostrar en `/clientes` (pregunta 14).

## 6. Ajustes en el panel (una tarde)

**Desbloquea:** que desaparezcan las etiquetas PROVISIONAL del panel.

- [ ] **Guardar las 23 plantillas PROVISIONAL** de correo y WhatsApp. Ya están corregidas; al guardarlas dejan de ser provisionales (pregunta 16).
- [ ] **Confirmar o cambiar en Configuración** (preguntas 6 y 15):
  - margen;
  - vigencia;
  - umbral de 30/45 días;
  - SLA y horario hábil;
  - moneda;
  - horas del resumen de WhatsApp.
- [ ] **Precios en la pantalla de aceptación** (pregunta 2). Hoy solo están en el PDF.

## 7. Equipo

- [ ] **Quiénes cotizan y hacen seguimiento,** con su rol (pregunta 18). Se invitan desde **Panel → Usuarios**.
- [ ] **Lecturas:**
  - para el equipo, `docs/manual-equipo.md`;
  - para tu socio, la guía de una página `docs/guia-socio-comercial.md`;
  - para la demostración, `docs/DEMO.md`.

## 8. Primer mes (cuando haya datos reales)

- [ ] **Decidir qué mejoras de `docs/MEJORAS.md` siguen.**
  - P-12 (recordatorio a la fábrica) ya está hecha.
  - Las del primer mes son P-13 a P-19, P-24 a P-29, P-32 a P-34 y P-36.
  - Recomendación: primero la bandeja "Requiere acción" (P-24) y el tablero de los 11 KPI (P-32).
- [ ] **A los 60 días,** calibrar las metas de PRD §3 con esos datos.

Ya resueltas el 03/10/2026: pagos en partes y tolerancia (pregunta 19), ITBMS (1), tiempo de respuesta de la fábrica (23), retención (21) y qué conservar al borrar datos (22). Ver D-113 a D-116.
