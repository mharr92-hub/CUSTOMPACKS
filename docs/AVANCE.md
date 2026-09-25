# Avance del proyecto

Estado por bloque de `TAREAS.md`. Se actualiza al cerrar cada bloque.

| Bloque | Estado | Fecha de cierre |
| --- | --- | --- |
| E0 — Base del proyecto | ✅ Hecho | 24/09/2026 |
| E1 — Datos maestros y admin | ✅ Hecho | 24/09/2026 |
| E2 — Sitio público | ✅ Hecho | 24/09/2026 |
| E3 — Cotizador | ✅ Hecho | 24/09/2026 |
| E4 — Arte y referencias | ✅ Hecho | 24/09/2026 |
| E5 — Notificaciones | ⏳ Pendiente | — |
| E6 — Panel interno | ⏳ Pendiente | — |
| E7 — RFQ y cotización | ⏳ Pendiente | — |
| E8 — Pedidos y seguimiento | ⏳ Pendiente | — |
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
