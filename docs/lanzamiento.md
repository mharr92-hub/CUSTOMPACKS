# Lanzamiento · Lo que falta de Mark y cómo se carga

La plataforma está completa y probada con datos de ejemplo. Para abrirla a clientes reales faltan contenido, datos del negocio y cuentas que solo Mark puede dar. Todo lo que hoy es provisional está marcado **PROVISIONAL** en el panel y **nunca se ve en el sitio público**.

Orden sugerido:

1. Crear las cuentas y el dominio (sección 3; pasos en `docs/deploy.md`).
2. Cargar catálogo y fotos (sección 1).
3. Confirmar los datos del negocio (sección 2).
4. Invitar al equipo (sección 4).
5. Probar con una solicitud real de cada segmento (sección 6).

## 1. Contenido

### 1.1 Catálogo real

Hoy el catálogo tiene datos provisionales para poder probar. Se reemplazan en **Panel → Catálogo** (admin): editar, completar y desmarcar PROVISIONAL.

| Qué | Hoy (provisional) | Qué hace falta |
| --- | --- | --- |
| Categorías | 5 | Confirmar nombres |
| Tipos de caja y bolsa | 18 | Lista real (PRD §20: 12 cajas y las bolsas), con código, descripción y foto |
| Tamaños estándar | 30 | Los 10 tamaños reales por familia, con medidas |
| Papeles / calibres | 5 / 3 | Papeles y calibres reales (g/m² o puntos) |
| Impresión / acabados | 6 / 8 | Lo que la fábrica realmente ofrece |
| Atributos ambientales / alimentarios | 4 / 5 | Solo los que la fábrica respalda con ficha técnica o certificado |
| Compatibilidades | 6 reglas | Qué papel y calibre sirve para cada tipo |
| Muestras de la galería | 12 | Las fotos de la maleta de 200 muestras (1.2) |

### 1.2 Fotos de muestras

Cada foto se nombra con el código de la muestra:

- `M-001.jpg` → foto principal de la muestra M-001
- `M-001-2.jpg`, `M-001-3.jpg` → fotos adicionales de la misma muestra

Formato JPG, PNG o WebP, hasta 10 MB cada una. Recomendado: 1600 px de lado, fondo neutro, sin logos de clientes.

**Cargarlas en lote** (en la computadora donde está el proyecto, con las variables de producción en `.env.local`):

```bash
pnpm gallery:import "C:\Fotos\muestras" --prueba   # muestra qué haría, sin cambiar nada
pnpm gallery:import "C:\Fotos\muestras"            # carga las fotos
pnpm gallery:import "C:\Fotos\muestras" --crear    # además crea las muestras que falten
```

- **Muestras que ya existen:** la carga reemplaza la foto principal y suma las adicionales. Repetirla no duplica fotos.
- **Muestras nuevas (`--crear`):** se crean **inactivas y PROVISIONAL**. Hay que completarlas en el panel (nombre, segmento, tipo, papel, acabados) y activarlas; recién entonces aparecen en la galería.
- **Cuándo se ven:** en el sitio, en unos 5 minutos.
- **Una por una:** también se pueden subir en Panel → Catálogo → Galería.

### 1.3 Textos del sitio

Los textos del sitio (inicio, cómo funciona, sostenibilidad, nosotros, FAQ, contacto, legales) están en `messages/es.json`. Se escribieron solo con lo que dice el PRD. Para cambiarlos, Mark envía el texto nuevo y se edita ese archivo (un commit), o lo edita directamente en GitHub.

Pendientes de Mark:

- **Logo e identidad visual.** Hoy el logo es de texto: "ProvenPack" con los colores kraft, verde bosque y negro.
- **Razón social y RUC** para las páginas legales. Hoy dicen "ProvenPack".
- **Revisión legal.** Recomendado: que un abogado en Panamá revise privacidad y términos (Ley 81 de 2019). Los textos ya reflejan lo que el sistema hace con los datos.
- **Logos y nombres de clientes** (KFC, McDonald's y otros): solo con autorización escrita. Hoy `/clientes` no muestra ninguno (`show_client_logos` = no).
- **Sellos de certificación:** solo con certificado vigente. Hoy no se muestra ninguno. Una prueba automática falla si aparecen sin autorización.

## 2. Datos del negocio por confirmar

Se editan en **Panel → Configuración** (admin). Al guardar un valor, deja de ser PROVISIONAL.

| Ajuste | Valor actual | Estado |
| --- | --- | --- |
| Margen por defecto (`default_margin_pct`) | 35 % | PROVISIONAL (se ajusta en cada cotización) |
| Vigencia de la cotización (`quote_validity_days`) | 15 días | PROVISIONAL (propuesta del PRD) |
| Anticipo (`deposit_pct`) | 50 % | Del PRD |
| Plazos (`lead_time_days_small` / `_standard`) | 30 / 45 días | Del PRD |
| Umbral entre 30 y 45 días (`lead_time_threshold_units`) | 10.000 unidades | PROVISIONAL (PRD §20) |
| Tamaño máximo por archivo (`max_file_mb`) | 100 MB | PROVISIONAL. En Supabase Free el límite real es 50 MB (D-012). |
| Archivos por pieza (`max_files_per_item`) | 10 | PROVISIONAL |
| SLA primera respuesta / cotización | 4 h / 24 h hábiles | PROVISIONAL |
| Horario hábil (`business_hours`) | Lun–vie 08:00–17:00 | PROVISIONAL |
| Recordatorios de vigencia / saldo | 3 y 1 días antes / 2 y 5 días después | PROVISIONAL |
| Encuesta NPS (`nps_delay_days`) | 7 días después del cierre | PROVISIONAL |
| Retención del arte (`artwork_retention_months`) | 24 meses | PROVISIONAL (propuesta del PRD) |
| **Instrucciones de pago** (`payment_instructions`) | Vacío | **Falta:** banco, cuenta, ACH, Yappy. Mientras esté vacío, el cliente ve un botón para pedirlas por WhatsApp. |
| **Correo del equipo** (`team_notification_email`) | Vacío (usa el de admin) | **Falta:** a qué correo van los avisos internos |
| Moneda | USD | PROVISIONAL |

Otras preguntas abiertas (PRD §20 y `docs/DECISIONES.md`):

- **Impuestos:** ¿los precios incluyen ITBMS? Hoy la cotización no los menciona (D-075).
- **RFQ:** formato exacto que prefiere la fábrica. Se ajusta en `config/rfq-format.ts`, sin tocar lo demás.
- **Plazo de entrega:** si incluye tránsito, aduana y entrega local; lugar de entrega estándar.
- **Condiciones de los términos:** tolerancias de cantidad y color; política de muestras físicas; diseño de arte como servicio y su tarifa.
- **Alcance:** si se cotiza fuera de Panamá y con qué reglas de flete.
- **Mensajes:** 15 de las 25 plantillas de correo y WhatsApp son PROVISIONAL. Revisarlas en Panel → Plantillas; al guardar, dejan de serlo.

## 3. Cuentas y credenciales

Ninguna credencial va en el código ni en el repositorio: se cargan como variables de entorno en Vercel, o como secretos en GitHub para los respaldos. Ningún paso requiere un plan de pago, salvo lo indicado en `docs/deploy.md`.

| Qué | Variable | Dónde se obtiene |
| --- | --- | --- |
| Dominio | `NEXT_PUBLIC_SITE_URL` | Registrar (primera opción: `provenpack.com`). DNS en Cloudflare, gratis. |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Proyecto nuevo (plan Free) → Project Settings |
| Correo transaccional | `RESEND_API_KEY`, `MAIL_FROM` | Cuenta de Resend y el dominio verificado (SPF, DKIM, DMARC) |
| WhatsApp del negocio | `NEXT_PUBLIC_WHATSAPP_NUMBER` | Número con código de país, sin signos (hoy es de ejemplo) |
| Correo de contacto | `NEXT_PUBLIC_CONTACT_EMAIL` | Hoy es de ejemplo |
| Correo de la fábrica | `FACTORY_EMAIL` | A dónde salen los RFQ |
| Administrador | `ADMIN_EMAIL` | El correo de Mark: queda como admin al entrar por primera vez |
| Claves internas | `AUTH_SECRET` (32+ caracteres), `CRON_SECRET` | Generar al azar (ver `docs/deploy.md`). En producción `AUTH_SECRET` es obligatoria. |
| Google Analytics 4 | `NEXT_PUBLIC_GA_ID` | Propiedad de GA4 (`G-…`) |
| Meta Pixel | `NEXT_PUBLIC_META_PIXEL_ID` | Business Manager |
| Opcional: captcha | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (gratis), si llega spam |
| Opcional: errores | `NEXT_PUBLIC_SENTRY_DSN` | Proyecto de Sentry (plan gratuito) |
| Respaldos | Secretos `BACKUP_DATABASE_URL`, `BACKUP_PASSPHRASE` en GitHub | Ver `docs/respaldos.md` |

## 4. Equipo

1. Mark entra a `/admin` con `ADMIN_EMAIL`.
2. En **Usuarios**, invita a cada persona con su rol: Ventas, Operaciones y QA, o Solo lectura (PRD §20: definir quiénes cotizan y hacen seguimiento).
3. Capacitación con `docs/manual-equipo.md`, que tiene capturas de cada paso.
4. Solicitudes en curso fuera de la plataforma: el equipo las carga desde `/cotizar` con los datos del cliente. La casilla de consentimiento se marca solo si el cliente lo dio; si no, se le envía el enlace del cotizador para que la complete él. A partir de ahí siguen el flujo normal.

## 5. Campaña inicial

Con GA4 y el Pixel configurados, el sitio ya envía:

- **GA4:** `wizard_step_view`, `wizard_step_complete`, `wizard_step_error`, `wizard_option`, `wizard_add_piece`, `wizard_file_uploaded`, `wizard_save_later_*`, `wizard_prefer_talk` y `wizard_submit`.
- **Meta:** `Lead` al enviar una solicitud.

Los anuncios deben llevar `utm_source`, `utm_medium` y `utm_campaign`. El panel las guarda con cada solicitud, y **Reportes → Solicitudes por canal** muestra cuántas llegaron y cuántas se aceptaron por campaña.

## 6. Criterio de salida del MVP (PRD §18)

> Una solicitud real de cada segmento recorre el ciclo completo (solicitud, RFQ, cotización, aceptación, pedido, hitos, pagos) sin usar hojas de cálculo ni retipear datos.

El ciclo completo ya se prueba de forma automática en cada cambio:

- `tests/e2e/journey.spec.ts`: comercio, con impresión, arte y proof, del celular del cliente al pedido cerrado.
- `tests/e2e/orders.spec.ts`: alimentos (clamshell con papel antigrasa), de la solicitud al pedido cerrado, con foto de QA y saldo.

Falta hacerlo con clientes reales. Lista para marcar en producción:

- [ ] **Comercio:** solicitud real → RFQ enviado a la fábrica → respuesta registrada → cotización emitida → aceptada por el cliente → anticipo → producción → QA con fotos → embarque → entrega → saldo → cerrado.
- [ ] **Alimentos:** el mismo recorrido con una pieza de contacto con alimentos (atributos alimentarios elegidos en el cotizador).
- [ ] En ninguno de los dos se usó una hoja de cálculo ni se volvió a escribir un dato: la ficha, el RFQ, la cotización y el pedido salieron de la solicitud.
- [ ] El cliente no vio ningún precio en pantalla: solo en el PDF de la cotización y en el estado de pagos.
- [ ] Los avisos llegaron: correos automáticos y WhatsApp enviados desde el panel.
