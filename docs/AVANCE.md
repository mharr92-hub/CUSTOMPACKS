# Avance del proyecto

Estado por bloque de `TAREAS.md`. Se actualiza al cerrar cada bloque.

| Bloque | Estado | Fecha de cierre |
| --- | --- | --- |
| E0 — Base del proyecto | ✅ Hecho | 24/09/2026 |
| E1 — Datos maestros y admin | ✅ Hecho | 24/09/2026 |
| E2 — Sitio público | ✅ Hecho | 24/09/2026 |
| E3 — Cotizador | ✅ Hecho | 24/09/2026 |
| E4 — Arte y referencias | ✅ Hecho | 24/09/2026 |
| E5 — Notificaciones | ✅ Hecho (disparadores y crons de pedido completados en E8) | 24/09/2026 |
| E6 — Panel interno | ✅ Hecho | 24/09/2026 |
| E7 — RFQ y cotización | ✅ Hecho | 24/09/2026 |
| E8 — Pedidos y seguimiento | ✅ Hecho | 24/09/2026 |
| E9 — Calidad y seguridad | ⏳ Pendiente | — |
| E10 — Lanzamiento | ⏳ Pendiente | — |

---

## E0 — Base del proyecto

**Qué quedó hecho**
- Next.js 16.3 (App Router, Turbopack) con TypeScript estricto (`strict`, `noUncheckedIndexedAccess`), Tailwind 4 y ESLint 9. pnpm 12.
- shadcn/ui 4 (Radix): button, input, select, textarea, card, dialog, table, badge, tabs, sonner (reemplaza toast), field y label (reemplazan form), checkbox, radio-group, separator, sheet, dropdown-menu, progress y tooltip.
- Supabase: `supabase/config.toml` (CLI), clientes en `lib/supabase/{server,client,admin}.ts` y capa SQL con RLS en `lib/db/{client,actor}.ts`.
- Base local sin Docker: Postgres 17 embebido y shim de Supabase (D-002). `pnpm dev` la levanta sola; también están `pnpm db:start|reset|migrate|seed`.
- next-intl sin rutas por idioma: `messages/es.json` tipado, y ESLint prohíbe texto literal en JSX (`react/jsx-no-literals`).
- `config/brand.ts`: nombre, slogan, colores, WhatsApp, correo y URL, leídos de variables de entorno.
- Layout base: header con logo de texto y navegación de §17 (menú móvil en `Sheet`), footer con condiciones 50/50, plazos y "sin mínimo", botón flotante de WhatsApp y enlace "saltar al contenido".
- Vitest (proyectos `unit` y `db`) y Playwright (móvil Pixel 7 y escritorio), cada uno con un test de humo.
- GitHub Actions: lint, typecheck y test en cada push.
- `vercel.json` (crons vacíos), `docs/deploy.md`, `docs/DECISIONES.md`, `docs/AVANCE.md`, `.env.example` y `README.md`.
- Cabeceras de seguridad básicas en `next.config.ts`.

**Qué falta / notas**
- Nada pendiente. El push a GitHub funcionó y el CI corrió en verde (run 36071020975).

**Cómo probarlo**
```bash
pnpm install
pnpm dev                       # http://localhost:3000 (levanta Postgres local)
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                  # usa su propio servidor en :3100
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint`, `pnpm typecheck` y `pnpm test`: en verde.
- `pnpm test:e2e` (móvil y escritorio): 2/2 en verde.
- `pnpm dev`: inicio responde 200 con layout, slogan, footer 50/50 y enlace wa.me.

---

## E1 — Datos maestros y admin

**Qué quedó hecho**
- Migración `001_master_data`:
  - Tablas del catálogo: `categories`, `product_types`, `standard_sizes`, `papers`, `calibers`, `print_options`, `finishes`, `eco_attributes`, `food_attributes`, `compatibilities`, `gallery_samples`, `settings` y `message_templates`, con las columnas comunes y la auditoría `created_*/updated_*` por trigger.
  - RLS: el público solo lee lo activo. Al rol `anon` se le ocultan por columna `factory_notes` y `created_by/updated_by`.
  - Bucket público `catalog`.
- Migración `002_auth`:
  - `profiles` con el rol `admin|sales|ops|viewer|client` y las funciones `has_role`, `is_staff` e `is_admin`.
  - Trigger de alta: `settings.admin_email` recibe rol admin. La app lo sincroniza con `ADMIN_EMAIL`.
  - Protección contra auto-escalada de rol y contra quitar el último admin.
  - Políticas: el staff lee todo y solo admin escribe.
- `supabase/seed.sql` (idempotente, todo PROVISIONAL):
  - Catálogo: 4 categorías (+1 inactiva), 12 tipos de caja, 6 de bolsa, 5 papeles, 3 calibres sin gramaje y 30 tamaños (S1–S10 × 3 familias).
  - Opciones: 6 de impresión, 8 acabados, 4 atributos ambientales (sin sello) y 5 de aptitud alimentaria.
  - Además: 6 compatibilidades, 12 muestras de referencia y 17 claves de configuración.
- `lib/compat.ts`: evaluación tipo × papel × calibre (listas blancas y exclusiones con motivo) y calibre sugerido por peso.
- Autenticación por enlace mágico (Supabase Auth, o modo local con cookie firmada):
  - `/auth/confirm` recibe el enlace.
  - `proxy.ts` protege `/admin`.
  - `requireStaff`/`assertStaff` verifican el rol en páginas y acciones.
- Infraestructura:
  - `lib/storage`: Supabase Storage o disco local, con URLs firmadas y subida directa por PUT.
  - `lib/files/magic.ts`: detección del tipo real de archivo por magic bytes.
  - `lib/mail.ts`: correo con Resend o simulado.
- Panel:
  - `/admin/catalogo`: resumen con conteo de provisionales.
  - Listado por entidad: orden ↑↓, activar/desactivar y etiqueta PROVISIONAL.
  - Formulario validado que conserva lo escrito si hay error, y fotos principal y adicionales.
  - `/admin/catalogo/compatibilidades`: matriz papel × calibre con motivo y resultado para el cliente.
  - `/admin/configuracion` para `settings`.
- API pública `GET /api/catalog`: catálogo activo, cacheado con la etiqueta `catalog`, que se invalida al guardar en el panel.

**Qué falta / notas**
- Invitaciones de usuarios, bandeja y el resto del menú del panel: E6.
- Las fotos reales y la validación de la taxonomía dependen de Mark (PRD §20).

**Cómo probarlo**
```bash
ADMIN_EMAIL=tu@correo.com pnpm dev
```
1. Abre http://localhost:3000/admin, escribe ese correo y usa "Abrir enlace de acceso" (modo local).
2. Catálogo > Tipos de producto > Nuevo; sube una foto; luego Compatibilidades.
3. http://localhost:3000/api/catalog muestra el tipo nuevo con su foto y su regla.

```bash
pnpm test         # unit + db (RLS, roles, seed)
pnpm test:e2e     # incluye tests/e2e/admin-catalog.spec.ts
```

**Resultado de la verificación (24/09/2026)**
- El seed corre limpio sobre base vacía (`pnpm db:reset`) y es idempotente (lo prueba un test).
- `pnpm test`: 31/31 en verde.
  - 14 de lógica de compatibilidades.
  - 12 de RLS, roles y seed.
  - 5 de magic bytes y formularios.
- `pnpm test:e2e --project desktop`: 4/4 en verde. Incluye el criterio de aceptación: el admin crea un tipo con foto, marca la compatibilidad y el tipo aparece en `/api/catalog`.
- `pnpm lint` y `pnpm typecheck`: en verde.

---

## E2 — Sitio público

**Qué quedó hecho**
- **Identidad visual (D-023):** lenguaje del troquel (corte y pliegue), marcas de corte de imprenta en las fotos y un troquel animado en el hero. Fondo blanco cartulina, kraft y verde bosque; Inter con números tabulares en medidas.
- **Inicio** con las 10 secciones de §17 en orden:
  1. Hero con slogan, "Cotiza en 5 minutos", WhatsApp y la explicación de por qué no hay precio en línea.
  2. Franja de pruebas.
  3. Dos puertas (comercio / alimentos).
  4. Piezas del catálogo.
  5. Cómo funciona.
  6. Maleta de muestras.
  7. Clientes (texto genérico, sin logos).
  8. Sostenibilidad.
  9. Preguntas frecuentes.
  10. Cierre.
- **Catálogo:**
  - `/catalogo`, con filtros por categoría y segmento como enlaces.
  - `/catalogo/[categoria]`.
  - Ficha `/catalogo/[categoria]/[tipo]`: fotos o marcador, usos, papeles y calibres compatibles (con los motivos de las reglas), tamaños estándar, impresión, acabados, aptitud alimentaria, condiciones (sin mínimo, plazo, 50/50) y "Cotizar esta pieza" (`/cotizar?tipo=<código>`).
- **Galería:** `/galeria` con filtros por segmento y tipo, código visible y "Quiero algo así" (`/cotizar?muestra=<código>`).
- **Páginas interiores:**
  - `/como-funciona`: 8 pasos de §6 con "tú / nosotros / lo que ves".
  - `/sostenibilidad`: atributos sin sellos, solo con respaldo de fábrica.
  - `/clientes`: sin logos ni nombres.
  - `/nosotros`, `/faq` (10 preguntas), `/contacto`, `/legal/privacidad` (Ley 81 de 2019) y `/legal/terminos` (50/50, plazos, vigencia, tolerancias según ficha de fábrica).
  - Página 404.
  - `/cotizar` provisional (WhatsApp) hasta E3.
- **SEO:**
  - Metadatos y canonical por página.
  - JSON-LD `Organization` (todas las páginas), `Product` y `BreadcrumbList` (fichas) y `FAQPage` (`/faq`).
  - `sitemap.xml` con categorías y fichas, `robots.txt` (bloquea `/admin`, `/api`, `/auth`, `/seguimiento`) e imagen OpenGraph generada.
- **Rendimiento:**
  - ISR de 5 minutos (inicio, categorías y fichas se pre-renderizan en el build).
  - Sitio público casi sin JS: menú móvil con `<details>` (D-024).
  - Marcadores de foto estáticos y fuente local sin precarga (D-025).
- `pnpm build` también levanta la base local si hace falta. `scripts/lighthouse.mjs` audita en móvil con el Chromium de Playwright.

**Qué falta / notas**
- LCP simulado del inicio: 2,6–2,9 s en local con gzip. El resto de páginas está en 2,0–2,5 s. El LCP real observado es de 0,1–0,4 s. Se vuelve a medir en el preview de Vercel en E9 (D-026).
- Fotos reales, textos definitivos y revisión legal: E10 (dependen de Mark).

**Cómo probarlo**
```bash
pnpm dev                                   # http://localhost:3000
pnpm test:e2e                              # rastreo completo del sitio, SEO, filtros sin JS y menú móvil
pnpm build && pnpm start -- --port 3200    # producción local
node scripts/lighthouse.mjs http://localhost:3200 / /catalogo/cajas/plegadiza-con-tapa
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint`, `pnpm typecheck` y `pnpm test` (31/31): en verde.
- `pnpm test:e2e`: 9/9 en verde (7 omitidos por proyecto móvil/escritorio). Incluye:
  - Rastreo de más de 30 páginas públicas sin enlaces rotos, con un solo `h1` por página, sin ningún precio ni la etiqueta PROVISIONAL.
  - Sitemap, robots, JSON-LD, canonical e imagen OpenGraph.
  - Filtros del catálogo y la galería con JavaScript desactivado.
  - Menú móvil que se cierra al navegar.
- Lighthouse móvil (build de producción local):

  | Página | Rendimiento | SEO | Accesibilidad | Buenas prácticas | LCP |
  | --- | --- | --- | --- | --- | --- |
  | Inicio | 94–96 | 100 | 100 | 100 | 2,6–2,9 s |
  | Ficha (`/catalogo/cajas/plegadiza-con-tapa`) | 97–99 | 100 | 100 | 100 | 2,0–2,5 s |
  | `/catalogo` | 96–99 | 100 | 100 | 100 | 2,1–2,7 s |
  | `/galeria` | 97 | 100 | 100 | 100 | 2,5–2,6 s |
  | `/como-funciona` | 98 | 100 | 100 | 100 | 2,4 s |
  | `/faq` | 98 | 100 | 100 | 100 | 2,4 s |

  Se cumple el criterio de aceptación de E2 (≥ 90 en rendimiento y SEO en inicio y una ficha).

## E3 — Cotizador

**Qué quedó hecho**
- **Migración `003_quotes`:**
  - Tablas: `companies` (RUC único normalizado), `quote_drafts` (token, payload, paso, vencimiento a 30 días, cupo de correos de reanudación), `quote_requests` (número `S-AAAA-NNNNN`, estado de §14, semáforo, canal, segmento, fecha deseada, entrega, UTM, asignado, timestamps por estado, consentimiento con fecha e IP), `quote_items` (todos los campos de §13 más la ficha congelada), `quote_references` y `activities`.
  - Máquina de estados de la solicitud en la base: un trigger valida las transiciones y registra un historial inmutable. `lib/states.ts` es el espejo en TypeScript.
  - RLS: el cliente accede por el token de su enlace, el staff según su rol y anon no numera.
- **Wizard `/cotizar`** con los 10 pasos de §8 (0–9) en móvil primero:
  - Segmento.
  - Producto: peso, medidas, volumen, condiciones y uso.
  - Tipo con fotos o marcador y "No sé, sugiéranme".
  - Tamaño estándar, a medida o "según mi producto".
  - Material con compatibilidades, motivos visibles, sugerencias por condiciones y calibre por peso.
  - Impresión, Pantone validado y acabados.
  - Hasta 3 cantidades, frecuencia y fecha deseada con plazo en vivo.
  - Arte y referencias: la elección de arte, muestras de la galería y enlaces. La subida de archivos llega con E4.
  - Contacto con consentimiento.
  - Resumen tipo ficha técnica.
- **Multipieza (hasta 20):** "Agregar otra pieza" desde el paso 5, desde "No sé, sugiéranme" y desde el resumen. En el resumen se puede editar, quitar con "Deshacer" o ir al paso que falta.
- **Borradores:**
  - Autoguardado en el servidor y en `localStorage`.
  - "Guardar y seguir después" por correo (3 por día) o WhatsApp.
  - "Prefiero hablar" en cada paso, con el resumen parcial y el enlace del borrador.
  - "Cotizar esta pieza" y "Quiero algo así" se suman al borrador en curso (D-041).
- **Envío:**
  - Revalidación completa en el servidor y semáforo (D-031).
  - Número, empresa por RUC o contacto (D-034) y ficha técnica en PDF.
  - Confirmación "qué sigue" en `/cotizar/listo`, seguimiento en `/seguimiento/[token]` y correo de confirmación (simulado sin Resend).
  - Sin precio en ninguna pantalla.
- **Privacidad y seguridad:**
  - Tokens fuera de las URLs que ve la analítica (D-032).
  - Contacto guardado en el servidor solo con consentimiento y purga diaria de borradores vencidos por cron (D-033).
  - HTML de correos escapado.
  - UTM limitado a claves conocidas.
- **Accesibilidad:**
  - Foco en el título de cada paso y en el primer error.
  - Paso 0 (segmento) sin saltos con las flechas del teclado.
  - Contornos de foco sólidos.
  - Avisos de guardado, envío y bloqueo visibles y anunciados.
- **Analítica del embudo:** vista y fin de paso, errores, opción elegida con códigos de catálogo, piezas agregadas y lead (D-045).
- **Revisión adversarial (ultracode):** 4 revisores (PRD, lógica, seguridad y UX) y verificación escéptica de cada hallazgo. De 28 hallazgos, 23 se confirmaron y se corrigieron; 5 se descartaron con su razón. El revisor de lógica falló por red; su ámbito quedó cubierto por los tests nuevos.

**Qué falta / notas**
- La subida de arte y fotos de referencia del paso 7 es E4. Hoy "Tengo el arte" deja la pieza en rojo hasta que se suba el archivo.
- El correo de confirmación pasa a las plantillas de notificaciones en E5.
- El captcha y el límite de peticiones por IP se hacen en E9.

**Cómo probarlo**
```bash
pnpm dev                          # http://localhost:3000/cotizar
pnpm test                         # unit + db (semáforo, numeración, plazo, compatibilidades, flujo, empresa, borradores)
pnpm test:e2e                     # recorridos del cotizador en móvil y escritorio
curl http://localhost:3000/api/cron/purge-drafts   # en desarrollo no pide CRON_SECRET
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 90/90 en verde (unitarios y de base).
- `pnpm test:e2e`: 16/16 en verde (14 omitidos por proyecto móvil/escritorio). Incluye:
  - Dos piezas (una alimentaria y una bolsa de comercio) desde el celular, con número `S-AAAA-NNNNN`, confirmación sin token en la URL, seguimiento "Recibida" y PDF, en menos de 5 minutos.
  - Recorrido comercial completo en el celular con "No sé, sugiéranme" más una pieza con Pantone.
  - Combinaciones inválidas deshabilitadas, con el motivo visible.
  - Paso 0 (segmento) con teclado.
  - Precarga sumada al borrador.
  - Borrador recuperado desde otro navegador con el enlace.
  - Validaciones de Pantone, medidas, cantidades y fecha.
- Se cumple el criterio de aceptación de E3.

## E4 — Arte y referencias

**Qué quedó hecho**
- **Migración `004_artwork`:**
  - `artwork_files`: pieza, versión, archivo, formato, tamaño, estado de §9, checklist JSON, comentarios, revisor, aprobación del cliente, retención y borrado.
  - `artwork_approvals`: solo inserción e inmutable.
  - `quote_draft_files`: archivos verificados del borrador.
  - Bucket privado `artwork` (100 MB).
  - RLS: el cliente ve lo suyo por enlace; abrir y revisar es solo para el equipo asignado y admin (D-048). El cliente no ve columnas internas.
- **Subidas:**
  - Directas al almacenamiento con URL firmada: barra de progreso, 3 reintentos automáticos y botón "Reintentar".
  - Validación del tipo real por magic bytes (un PNG renombrado a `.pdf` se rechaza y se borra).
  - Límites desde `settings`: `max_file_mb` y `max_files_per_item`.
  - El mismo componente sirve para el cotizador, el portal y el panel.
- **Vista previa:** imágenes; primera página de PDF y AI con pdf.js, cargado a demanda, hasta 15 MB; ícono con el nombre para EPS y SVG (D-051).
- **Paso 7 del cotizador:**
  - "Tengo el arte", "Aún no tengo arte" o "Necesito que lo diseñen".
  - Con "Tengo el arte", subida de archivos PDF, AI, EPS o SVG.
  - Fotos de referencia (JPG, PNG, WebP o PDF), muestras de la galería y enlaces.
  - El checklist §21-B se ve al lado.
  - Al enviar, solo los archivos verificados pasan a la solicitud (D-046) y alimentan el semáforo.
- **Portal del cliente (`/seguimiento/[token]`):**
  - Versiones con estado, fecha, puntos a corregir con su nota y comentarios del equipo.
  - Ver y descargar con URL firmada.
  - "Subir nueva versión".
  - Proof con aprobación: nombre, fecha, hora, IP y navegador quedan registrados de forma inmutable.
- **Panel (`/admin/solicitudes/[id]`):**
  - Checklist de preprensa por punto (Correcto, Observado o No aplica) con nota.
  - Comentarios para el cliente y cambios de estado con sus reglas (D-049).
  - Subida del proof y "Liberar a fábrica".
  - Un miembro del equipo sin asignación ve los archivos pero no puede abrirlos.
- **Retención:** un cron diario marca lo vencido según `artwork_retention_months`; admin confirma el borrado en `/admin/archivos` (D-050).
- **Otras mejoras:**
  - Los guardados del borrador van en fila: dos guardados simultáneos ya no crean dos borradores, y los cambios hechos durante un guardado no se pierden.
  - Fechas con el mes en letras (D-047).

**Qué falta / notas**
- La bandeja, la asignación y el resto del detalle de la solicitud llegan en E6 (D-052). Mientras tanto la asignación se hace en la base.
- Los avisos al cliente (arte observado, proof listo) y al equipo (arte nuevo) llegan con las notificaciones de E5.
- La retención pasa a contar desde el último pedido en E8.
- En Supabase la subida usa `createSignedUploadUrl`. Falta probarla contra un proyecto real, porque no hay credenciales; el modo local cumple el mismo contrato.

**Cómo probarlo**
```bash
pnpm dev                              # /cotizar → paso 7; /seguimiento/<token>; /admin/solicitudes/<id>
pnpm test                             # RLS del arte, proof inmutable, archivos verificados, retención
pnpm test:e2e                         # 80 MB con progreso, revisión, proof y aprobación
curl http://localhost:3000/api/cron/artwork-retention
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 101/101 en verde.
- `pnpm test:e2e`: 19/19 en verde (17 omitidos por proyecto móvil/escritorio). Incluye:
  - Un PDF de 80 MB sube desde el paso 7 con barra de progreso (valores intermedios registrados) y llega a la solicitud.
  - El cliente lo abre con su enlace.
  - Un vendedor sin asignación no puede abrirlo; asignado, sí; admin, siempre.
  - Revisión con checklist, proof y aprobación del cliente con nombre e IP.
  - Un intento de modificar la aprobación en la base falla ("inmutable").
- Se cumple el criterio de aceptación de E4.

## E5 — Notificaciones

**Qué quedó hecho**
- **Migración `005_notifications`:**
  - `notifications`: evento, plantilla, solicitud, destinatario, canal, estado `queued|sent|simulated|failed`, texto enviado, enlace wa.me, error, intentos, clave contra duplicados y marca de envío manual.
  - `job_runs`.
  - Audiencia (cliente o equipo) en `message_templates`.
  - Las 20 plantillas: textos de §21-C y el resto PROVISIONAL.
  - Triggers que encolan por estado de solicitud (enviada, datos pendientes, cotizada, aceptada) y por arte (observado, proof listo).
- **Servicio `lib/notify`:**
  - Render de plantillas con variables: HTML escapado y solo los enlaces del sistema como `<a>`.
  - Correo por Resend con el marco de la marca; sin clave queda "simulated" y se ve en consola y en `.data/mail`.
  - WhatsApp click-to-chat con texto precargado (D-055).
  - Reintentos y bloqueo.
  - Registro en `activities`.
  - Ningún mensaje sale incompleto (D-053).
- **Disparadores:**
  - Solicitud recibida: cliente por correo y WhatsApp, y equipo.
  - Datos faltantes: con el motivo que escribe el equipo, o la lista del semáforo.
  - Cotización aceptada: al equipo.
  - Arte observado y proof listo.
  - La confirmación del cotizador ya sale por este camino.
- **SLA vencido al equipo** en horas hábiles (D-058): cron diario, más el uso del panel como máximo cada 10 minutos (D-054).
- **Panel:**
  - `/admin/plantillas`: lista, edición con vista previa en vivo, sin variables inexistentes; solo admin guarda.
  - En cada solicitud, el registro de notificaciones con el texto enviado, "Abrir WhatsApp" y "Marcar enviado".
- **Recordatorios** de vigencia (3 y 1 día), saldo (2 y 5 días) y NPS (7 días): cálculo de fechas listo y probado (D-059).

**Qué falta / notas**
- Quedan abiertas dos casillas, porque dependen de tablas de bloques siguientes:
  - Disparadores: los de solicitud y arte funcionan; los de pedido (anticipo, hitos, entrega) se conectan en E8.
  - Crons: el de SLA funciona; los de vigencia, saldo y NPS se conectan en E7 y E8.
  - Las plantillas y el cálculo de fechas ya están. Se marcan al cerrar E8.
- El paso a "Datos pendientes" con su motivo se hace desde el panel en E6. Hoy funciona si el estado cambia en la base.
- Resend real y dominio de envío: E10, con credenciales de Mark.

**Cómo probarlo**
```bash
pnpm dev                                      # enviar una solicitud en /cotizar → /admin/solicitudes/<id> → Notificaciones
pnpm test                                     # plantillas, horas hábiles, recordatorios, cola, SLA, WhatsApp manual
pnpm test:e2e                                 # avisos visibles en la solicitud y edición de plantillas
curl http://localhost:3000/api/cron/notifications
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 112/112 en verde.
- `pnpm test:e2e`: 21/21 en verde (19 omitidos por proyecto móvil/escritorio).
- Cada transición disponible hoy genera su notificación, que se ve en la solicitud. Sin credenciales todo queda "Simulado" y se ve en consola.

## E6 — Panel interno

**Qué quedó hecho**
- **Menú por rol:** Bandeja (portada del panel), Pedidos, Catálogo, Plantillas, Reportes, Usuarios, Archivos y Configuración (D-066). El login sigue siendo por enlace mágico.
- **Bandeja `/admin/solicitudes`:**
  - Filtros: estado, segmento, semáforo, asignada a, fechas, cantidad mínima y máxima, y búsqueda por número, empresa o contacto.
  - Orden por urgencia con SLA en horas hábiles (D-060).
  - "Tomar" y "Siguiente en turno" en las solicitudes sin asignar (D-061).
- **Detalle `/admin/solicitudes/[id]`:**
  - Datos del cliente y ficha técnica por pieza.
  - Referencias: fotos con URL firmada, enlaces y muestras.
  - Arte y proofs con la revisión de E4.
  - Historial unificado: estados con su motivo, asignaciones, notas, contactos, respuestas del cliente, avisos y arte.
  - Notas internas y registro de contactos por canal (WhatsApp, correo, llamada).
  - Notificaciones.
  - Asignación y cambio de estado validado por la máquina de §14, con el motivo de pérdida obligatorio en Rechazada (D-063).
  - "Pedir datos faltantes": lista armada desde el semáforo y editable, con la vista previa del mensaje (D-062).
- **Portal del cliente:** en Datos pendientes, caja "Nos faltan datos" con la lista y respuesta desde el enlace, que queda en el historial y avisa al equipo.
- **Usuarios `/admin/usuarios`:** invitar por correo con rol, cambiar rol y desactivar, con sus salvaguardas (D-065).
- **Auditoría:** `audit_log` con quién, qué, cuándo y los valores antes/después, en `/admin/auditoria` (D-064).
- **Permisos:**
  - El viewer lee todo y no ve controles de edición.
  - Toda acción exige rol editor en el servidor.
  - RLS lo vuelve a comprobar en la base.

**Qué falta / notas**
- Pedidos se llena en E8 y los reportes completos llegan en E9 (D-066).
- La edición de los datos técnicos de una pieza desde el panel no está en el alcance de E6. Lo que responde el cliente queda en el historial y se usa en el RFQ (E7).

**Cómo probarlo**
```bash
pnpm dev          # enviar una solicitud en /cotizar → /admin (Bandeja) → detalle
pnpm test         # permisos del viewer, flujo completo, turno, rechazo, usuarios, auditoría
pnpm test:e2e     # vendedor: tomar → pedir datos → respuesta del cliente → RFQ enviado; viewer sin edición
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 118/118 en verde.
- `pnpm test:e2e`: 23/23 en verde (21 omitidos por proyecto móvil/escritorio). Incluye el criterio de aceptación:
  - Un vendedor toma la solicitud, pide datos faltantes, recibe la respuesta del cliente desde su enlace y la pasa a "RFQ enviado" sin salir del panel.
  - El viewer no puede editar nada, verificado en la interfaz, en el servidor y en la base.

## E7 — RFQ y cotización

**Qué quedó hecho**
- **Migración `007_quotes_rfq` (D-069):**
  - `factory_rfqs`: versión, documentos, envío, respuesta con costos por cantidad, moneda, días de producción y observaciones.
  - `quotes`: número `C-AAAA-NNNNN-vN`; líneas internas con costo, flete, margen, precio, subtotal y plazo; vigencia, condiciones, PDF, estado, y aceptación inmutable con cantidades elegidas.
  - Bucket privado `documents`.
  - RLS: todo para el equipo; el cliente no lee costos ni precios.
  - Triggers de auditoría y de cierre de la cotización al rechazar o vencer la solicitud.
- **RFQ:**
  - PDF con marca y Excel (una fila por pieza y cantidad, columnas en `config/rfq-format.ts`), generados solo con la ficha congelada.
  - Exige arte en las piezas impresas; el arte liberado viaja como enlaces.
  - Envío por correo a `FACTORY_EMAIL` con los adjuntos; la solicitud pasa a "RFQ enviado".
  - Formulario de respuesta de fábrica (D-070).
- **Calculadora interna:** costo, flete y margen por línea con precio unitario y subtotal en vivo; margen por defecto desde `settings` (D-067).
- **Cotización:**
  - Borrador desde la respuesta de fábrica y emisión con PDF con marca: precios por cantidad, vigencia, 50/50, plazo y notas.
  - Versiones que reemplazan a la anterior.
  - Aviso al cliente por correo y WhatsApp (D-071, D-072).
- **Portal del cliente:**
  - Cotización sin precios en pantalla (D-068): descarga del PDF, elección de una cantidad por pieza y "Aceptar cotización" (fecha, nombre, IP, navegador).
  - "Pedir cambios": queda en el historial y avisa al equipo.
- **Al aceptar:** la solicitud pasa a Aceptada, el equipo recibe el aviso y queda el gancho `onQuoteAccepted` para crear el pedido en E8 (D-074).
- **Procesos:** vencimiento de cotizaciones y recordatorios de vigencia a 3 y 1 día (D-073), en `lib/jobs.ts`.

**Qué falta / notas**
- El pedido se crea en E8, desde el gancho que queda listo.
- En E5 sigue abierta la casilla de crons por los recordatorios de saldo y la encuesta NPS (E8). El de vigencia ya funciona.
- Impuestos en la cotización: pregunta abierta para Mark (D-075).
- El formato exacto que prefiere la fábrica sigue pendiente (PRD §20). Se ajusta en `config/rfq-format.ts`.

**Cómo probarlo**
```bash
pnpm dev          # solicitud en /cotizar → /admin/solicitudes/<id>: En revisión → Generar RFQ → Enviar → respuesta → Preparar cotización → Emitir
pnpm test         # precio, filas del RFQ, flujo completo, Excel, versiones, vencimiento, recordatorios, permisos
pnpm test:e2e     # de una solicitud verde a la aceptación del cliente desde su enlace
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 127/127 en verde.
- `pnpm test:e2e`: 24/24 en verde (22 omitidos por proyecto móvil/escritorio). Incluye el criterio de aceptación:
  - De una solicitud verde sale el RFQ sin retipear: PDF y Excel con los códigos.
  - Se registra el costo y se emite la cotización con el precio calculado.
  - Rechazar exige motivo.
  - El cliente descarga el PDF y acepta desde su enlace, sin ver ningún precio en pantalla.


---

## E8 — Pedidos y seguimiento

**Qué quedó hecho**
- **Migración `008_orders` (D-076):**
  - `orders`: número `P-AAAA-NNNNN`, cotización, estado, líneas internas, total, anticipo y saldo, plazo, inicio del plazo, fecha estimada, dirección, transporte, guía, ETA, notas, entrega y cierre.
  - `milestones`: tipo de §14, fecha, responsable, nota, evidencias y checklist de QA.
  - `payments`: anticipo o saldo, estado, monto, método, referencia, comprobante y confirmación.
  - `surveys`: NPS.
  - Bucket privado `evidence`.
  - Trigger de la máquina de estados del pedido (D-077); auditoría en las tres tablas.
  - RLS: el cliente lee su pedido sin columnas de montos.
  - Plantillas de producción y embarque; setting `payment_instructions` (PROVISIONAL, vacío).
- **Creación automática al aceptar la cotización:**
  - En la misma transacción: líneas y total según las cantidades elegidas, anticipo y saldo según el % de la cotización, y plazo = el mayor de las líneas.
  - Si el proof ya está aprobado, queda el hito "Arte aprobado".
- **Fecha estimada de entrega (D-080):** se calcula con `lib/leadtime.ts` al confirmar el anticipo y el proof, y se recalcula si el proof se aprueba después.
- **Panel `/admin/pedidos`:**
  - Lista: abiertos primero por fecha de entrega, alerta de atraso, estado de anticipo y saldo, comprobantes por revisar.
  - Detalle:
    - Línea de tiempo.
    - Subida de fotos, video y PDF por hito (D-081).
    - Registro del siguiente hito válido. QA usa el checklist contra la ficha, y el embarque lleva transporte, guía y ETA.
    - Envío y notas internas.
    - Pagos: registrar, confirmar o rechazar comprobantes, y ver el comprobante.
    - Resumen con montos y el PDF "Estado de pagos".
  - La solicitud enlaza a su pedido.
- **Reglas:**
  - Producción exige anticipo y proof aprobado.
  - QA exige cada punto del checklist.
  - Cerrar exige el saldo confirmado.
  - El viewer solo lee.
- **Portal del cliente `/seguimiento/[token]`:**
  - Estado, fecha estimada o fecha de entrega, y rastreo.
  - Etapas con fotos, video y el resultado de QA.
  - Estado de los pagos, sin montos (D-078), y cómo pagar (D-079).
  - Subida de comprobante.
  - Documentos: estado de pagos, cotización y ficha técnica.
  - "Pedir de nuevo" (D-083).
  - Encuesta NPS (D-084).
- **Avisos (D-082):** anticipo recibido, producción, QA, embarque, entrega con saldo y comprobante recibido (al equipo).
- **Procesos:** recordatorios de saldo a los 2 y 5 días de la entrega y encuesta NPS a los 7 días del cierre, en `lib/jobs.ts`.
- **E5 completo:** con esto quedan conectados los disparadores de pedido y los crons de saldo y NPS, así que se marcan las dos casillas que estaban abiertas en E5.

**Qué falta / notas**
- Datos de pago (banco, cuenta, Yappy): los carga Mark en `/admin/configuracion` > `payment_instructions`. Mientras tanto, el portal ofrece pedirlos por WhatsApp.
- Los montos del pedido no se ven en el portal, a diferencia de lo que decía TAREAS: van en el PDF "Estado de pagos" (D-078, por la regla de precios de CLAUDE.md).
- El recorrido completo cliente + equipo en una sola prueba es tarea de E9. En E8 hay un e2e desde la solicitud hasta el pedido cerrado.

**Cómo probarlo**
```bash
pnpm dev          # aceptar una cotización en /seguimiento/<token> → /admin/pedidos/<id>: anticipo → producción → QA con fotos → embarque → entrega → saldo → cerrar
pnpm test         # creación y montos, máquina de estados, proof, QA, evidencias, comprobantes, recordatorios, NPS, pedir de nuevo, permisos
pnpm test:e2e     # pedido completo con foto de QA visible para el cliente
```

**Resultado de la verificación (24/09/2026)**
- `pnpm lint` y `pnpm typecheck`: en verde.
- `pnpm test`: 135/135 en verde.
- `pnpm test:e2e`: 25/25 en verde (23 omitidos por proyecto móvil/escritorio).
- La prueba del pedido falló una vez en local sin dejar el detalle y no se volvió a reproducir en 7 corridas más, una con el servidor en frío. En CI hay un reintento con traza; si reaparece, se revisa en E9.
- Criterio de aceptación (e2e): pedido de anticipo a cerrado con hitos, foto de QA y saldo.
  - El cliente ve la foto de QA en su enlace segundos después de subirla (la prueba exige menos de un minuto).
  - Sube el comprobante del saldo, el equipo lo confirma y el pedido se cierra.
  - El portal no muestra ningún monto; el estado de pagos se descarga en PDF.
