# TAREAS.md — Cola de bloques para Claude Code

Cómo arrancar: abre Claude Code en la carpeta del proyecto y pega este mensaje:

> Lee `CLAUDE.md` y `docs/PRD.md`. Ejecuta `TAREAS.md` bloque por bloque, de E0 a E10, sin detenerte a preguntar; aplica las decisiones provisionales y registra cualquier otra en `docs/DECISIONES.md`. Usa el nivel de esfuerzo de cada bloque. Al cerrar cada bloque actualiza `docs/AVANCE.md`, marca las casillas aquí y haz commit.

Referencias `§N` = sección N del PRD.

---

## Decisiones provisionales (resuelven las dudas abiertas de §20)

Todas son cambiables desde una sola tabla `settings` o desde `config/brand.ts`; ninguna requiere tocar código de negocio.

| Duda | Decisión provisional | Dónde vive | Cómo se cambia |
| --- | --- | --- | --- |
| Nombre comercial y dominio | `NEXT_PUBLIC_BRAND_NAME` = "ProvenPack" (elegido por Mark el 24/09/2026); dominio pendiente de registro por Mark (provenpack.com como primera opción) | `.env`, `config/brand.ts` | Cambiar la variable; todo el sitio, PDFs y correos la leen de ahí |
| Identidad visual | Logo de texto con la marca; paleta neutra (kraft, verde bosque, negro); tipografía Inter | `config/brand.ts`, `tailwind.config` | Reemplazar logo SVG y tokens de color |
| Taxonomía real (tipos, papeles, calibres, tamaños) | Cargar los valores propuestos en §7 como seed con `is_provisional = true` | `supabase/seed.sql` | El equipo edita o desactiva desde admin; los provisionales llevan etiqueta |
| Umbral de volumen 30 vs 45 días | `lead_time_threshold_units` = 10000 (≤ 10.000 unidades → 30 días; más → 45) | tabla `settings` | Editar en admin > Configuración |
| Desde cuándo corre el plazo | Desde el último de: anticipo confirmado y proof aprobado | `lib/leadtime.ts` | Cambiar la regla en un solo lugar |
| Alcance del plazo | Incluye producción y tránsito hasta la dirección de entrega del cliente | texto en §14 y en cotización | Editar plantilla de condiciones |
| Moneda | USD en todo | `settings.currency` | Editar |
| Vigencia de cotización | 15 días calendario | `settings.quote_validity_days` | Editar |
| Métodos de pago | Registro manual: transferencia o ACH con comprobante | admin > Pedido > Pagos | Fase 2 pasarela |
| Tamaño de archivos de arte | 100 MB por archivo, 10 por pieza | `settings.max_file_mb`, `settings.max_files_per_item` | Editar |
| Retención de arte | 24 meses tras el último pedido | `settings.artwork_retention_months` | Editar |
| Muestras físicas | Solo texto "consulta con tu asesor"; sin lógica | FAQ y paso 7 | Fase 2 |
| Diseño de arte | Opción "necesito diseño" existe y marca la solicitud; sin tarifa ni flujo | paso 7 | Fase 2 |
| Logos de clientes | No mostrar logos ni nombres; texto genérico "cadenas internacionales de comida rápida y grandes almacenes" | sección Clientes | Cuando haya autorización, activar `show_client_logos` |
| Certificaciones ambientales | Atributos como texto; sin sellos ni siglas de certificación | `eco_attributes.show_badge = false` | Activar cuando haya certificado |
| Tolerancias de cantidad y color | No mencionar cifras; texto "según ficha técnica de fábrica" | plantilla de condiciones | Editar cuando fábrica confirme |
| Mercado y flete | Panamá; flete se estima a mano en la cotización interna | admin > Cotización | Fase 2 tabla por destino |
| Roles del equipo | admin, sales, ops, viewer; el primer usuario registrado con `ADMIN_EMAIL` es admin | `profiles.role` | Editar en admin > Usuarios |
| CRM externo | Ninguno; exportación CSV | admin > Reportes | Fase 2 |
| WhatsApp y correo | `NEXT_PUBLIC_WHATSAPP_NUMBER` y `MAIL_FROM` con valores de ejemplo; modo simulado sin credenciales | `.env.example` | Poner valores reales |
| Supabase | Proyecto real si hay credenciales; si no, local | `.env` | Poner credenciales del proyecto de Mark |
| Sitio web previo | Se asume que no existe nada que migrar | — | — |

---

## E0 — Base del proyecto · esfuerzo: medium · semana 1

Objetivo: repositorio corriendo en local con Next.js, Supabase, lint, tests, CI y documentación de despliegue.

- [x] `pnpm create next-app` con App Router, TypeScript estricto, Tailwind, ESLint; instalar shadcn/ui (button, input, select, textarea, card, dialog, table, badge, tabs, toast, form).
- [x] Supabase CLI: `supabase init`, `supabase start`; clientes en `lib/supabase/{server,client,admin}.ts`; `.env.example` con todas las variables de `CLAUDE.md`.
- [x] next-intl con `messages/es.json`; ninguna cadena fija en componentes.
- [x] `config/brand.ts` (nombre, slogan "Probamos que somos los mejores", colores, WhatsApp, correo) leyendo de variables de entorno.
- [x] Layout base: header con logo de texto, navegación (§17 mapa del sitio), footer con condiciones 50/50 y plazos; botón flotante de WhatsApp.
- [x] Vitest + Playwright configurados con un test de humo cada uno; scripts `lint`, `typecheck`, `test`, `test:e2e`.
- [x] GitHub Actions: lint + typecheck + test en cada push.
- [x] `vercel.json` con crons vacíos y `docs/deploy.md` (pasos para Vercel, Supabase, Resend, dominio; sin ejecutarlos).
- [x] `docs/DECISIONES.md` y `docs/AVANCE.md` creados.

Aceptación: `pnpm dev` abre la página de inicio con el layout; `pnpm lint && pnpm typecheck && pnpm test` en verde; CI en verde.

## E1 — Datos maestros y admin · esfuerzo: medium · semanas 1–2

Objetivo: esquema completo del catálogo (§7, §13) con RLS, seed provisional y CRUD en el panel interno.

- [x] Migración `001_master_data`: `categories`, `product_types`, `standard_sizes`, `papers`, `calibers`, `print_options`, `finishes`, `eco_attributes`, `food_attributes`, `compatibilities` (product_type × paper × caliber, `allowed`, `reason`), `gallery_samples` (code `M-001`, fotos, tags), `settings` (clave, valor, tipo), `message_templates`. Todas con `code`, `name`, `description`, `photo_url`, `is_active`, `is_provisional`, `sort_order`, `affects_price`, `factory_notes`.
- [x] Migración `002_auth`: `profiles` (user_id, name, role enum `admin|sales|ops|viewer|client`, company_id, whatsapp). Trigger: nuevo usuario con `ADMIN_EMAIL` → role admin.
- [x] RLS: público lee solo `is_active = true`; staff lee y escribe según rol; auditoría por trigger en `updated_at/updated_by`.
- [x] `supabase/seed.sql` con los valores propuestos de §7 marcados `is_provisional = true`, incluidas 12 tipos de caja (elige los 12 más usados en food service y retail de la lista de candidatos), 6 tipos de bolsa, 5 papeles, 3 calibres (ligero/medio/pesado, gramaje `NULL`), 10 tamaños genéricos S1–S10 por familia, opciones de impresión, acabados, atributos y 6 compatibilidades de ejemplo (balde y cono exigen antigrasa; rígida excluye microcorrugado).
- [x] Admin `/admin/catalogo`: tablas editables por entidad, reordenar, activar/desactivar, subir foto a Storage, editor de compatibilidades en matriz; etiqueta "PROVISIONAL" visible; `/admin/configuracion` para `settings`.
- [x] Tests Vitest de `lib/compat.ts` (combinación válida/no válida con razón).

Aceptación: admin puede crear un tipo nuevo con foto, marcar compatibilidades y verlo en la API pública; seed corre limpio en base vacía.

## E2 — Sitio público · esfuerzo: high · semanas 2–4

Objetivo: sitio completo de §17 con SEO, responsive y diseño con identidad propia (no plantilla genérica).

- [x] Inicio con las 10 secciones de §17 en ese orden; hero con slogan y CTA "Cotiza en 5 minutos" + WhatsApp; franja de pruebas; dos puertas (comercio / alimentos).
- [x] `/catalogo` con filtros por categoría y segmento; `/catalogo/[categoria]/[tipo]` = ficha de producto según §7 (fotos, usos, compatibilidades, tamaños, impresión, aptitud, "sin cantidad mínima", plazo, botón "Cotizar esta pieza" → `/cotizar?tipo=<code>`).
- [x] `/galeria`: grilla de `gallery_samples` con filtros y botón "quiero algo así" (guarda referencia en el borrador del wizard).
- [x] `/como-funciona` (8 pasos de §6), `/sostenibilidad`, `/clientes` (texto genérico, sin logos), `/faq` (lista de §17), `/contacto`, `/legal/privacidad`, `/legal/terminos` (condiciones 50/50, plazos, texto de tolerancias "según ficha técnica de fábrica").
- [x] SEO: metadatos por página, JSON-LD Organization/Product/FAQ, `sitemap.xml`, `robots.txt`, OpenGraph con imagen generada.
- [x] Rendimiento: `next/image`, fuentes locales, LCP < 2,5 s en Lighthouse móvil; accesibilidad AA básica.
- [x] Placeholders de fotos: generar SVG neutros con el código de la pieza hasta que lleguen las fotos reales; nunca fotos de terceros.

Aceptación: Lighthouse móvil ≥ 90 en rendimiento y SEO en inicio y una ficha; navegación completa sin enlaces rotos (test Playwright); todo texto viene de `messages/es.json`.

## E3 — Cotizador · esfuerzo: ultracode · semanas 3–5

Objetivo: wizard de 9 pasos de §8, multipieza, con guardado de borrador, lógica condicional, resumen, numeración y semáforo; sin precio en ninguna pantalla.

- [ ] Migración `003_quotes`: `companies`, `quote_drafts` (token, payload JSON, step, expires_at), `quote_requests` (número `S-AAAA-NNNNN` por secuencia, estado enum de §14, semáforo, canal, segmento, fecha_deseada, dirección, UTM, asignado_a, timestamps por estado), `quote_items` (todos los campos de §13), `references`, `activities`. RLS: el cliente accede a lo suyo por token o por usuario; staff según rol.
- [ ] Estado del wizard en servidor (`quote_drafts`) con respaldo en localStorage; reanudar por enlace mágico enviado a correo o WhatsApp.
- [ ] Pasos 0–9 exactamente como §8: segmento; producto (peso, dimensiones, condiciones, uso); tipo con tarjetas y "no sé, sugiéranme"; tamaño estándar/personalizado/"según mi producto"; material con compatibilidades y calibre sugerido por peso; impresión y acabados (Pantone con validación `\d{3,4}\s?[CU]`); cantidades (hasta 3) + frecuencia + fecha deseada con plazo estimado en vivo (`lib/leadtime.ts` usando `settings.lead_time_threshold_units`); arte y referencias (integración con E4; en E3 deja el slot); contacto y entrega con consentimiento; resumen tipo ficha técnica + envío.
- [ ] Multipieza: "agregar otra pieza" repite pasos 2–5; resumen muestra todas.
- [ ] Botón "Prefiero hablar" en cada paso → `wa.me` con resumen parcial y token del borrador.
- [ ] Semáforo (`lib/traffic-light.ts`): rojo si falta cantidad, tipo, o arte cuando hay impresión; amarillo si faltan peso, dimensiones o referencias; verde si todo.
- [ ] Al enviar: crea `quote_request` + `quote_items`, número, semáforo, ficha técnica PDF (`/api/pdf/ficha/[id]`), página de confirmación "qué sigue" (respuesta en 24 h hábiles, condiciones, enlace de seguimiento `/seguimiento/[token]`), eventos de analytics por paso.
- [ ] Mensajes de validación específicos (§8 "Validaciones clave"); accesible por teclado; móvil primero.
- [ ] Tests: Vitest para semáforo, numeración, plazo, compatibilidades; Playwright: solicitud de dos piezas (comercial y alimentaria) completada en móvil en < 5 min de interacción simulada.

Aceptación: un usuario sin conocimientos técnicos completa dos piezas desde el celular y recibe número y confirmación; ninguna combinación inválida es seleccionable; el borrador se recupera desde otro navegador con el enlace.

## E4 — Arte y referencias · esfuerzo: high · semana 5

Objetivo: subida de arte a Storage privado, versiones, checklist manual, referencias desde la galería (§9).

- [ ] Migración `004_artwork`: `artwork_files` (pieza, versión, url, formato, tamaño, estado enum `received|in_review|observed|approved_for_proof|proof_sent|proof_approved|released`, checklist JSON, comentarios, revisado_por, aprobado_por_cliente_at).
- [ ] Bucket privado `artwork` con RLS; subida directa con URL firmada, barra de progreso, reintento, validación de tipo real (magic bytes), límites desde `settings`.
- [ ] Vista previa: PDF primera página (pdf.js) e imágenes; para AI/EPS mostrar ícono + nombre.
- [ ] Paso 7 del wizard integrado: "tengo arte" / "aún no tengo arte" / "necesito diseño"; checklist de §21-B visible al lado; referencias por foto, enlace o muestra de galería.
- [ ] Portal: subir nueva versión; ver comentarios; aprobar proof (registra fecha, hora, usuario, IP).
- [ ] Cron de retención según `artwork_retention_months` (solo marca, no borra, hasta confirmación admin).

Aceptación: archivo de 80 MB sube con progreso y solo lo abren cliente, staff asignado y admin; el proof aprobado queda con sello de tiempo inmutable.

## E5 — Notificaciones · esfuerzo: medium · semanas 5–6

Objetivo: todos los eventos de §12 por correo y wa.me, con plantillas editables y registro.

- [ ] Migración `005_notifications`: `notifications` (evento, destinatario, canal, estado `queued|sent|simulated|failed`, payload, enviado_at) y carga de `message_templates` con los textos de §21-C.
- [ ] Servicio `lib/notify.ts`: render de plantilla con variables, envío por Resend (o simulado), enlace wa.me con texto precargado, registro en `activities`.
- [ ] Disparadores por cambio de estado (trigger o hook en servidor) para cada fila de la tabla de §12.
- [ ] Crons: vigencia por vencer (3 y 1 día), saldo pendiente (2 y 5 días tras entrega), encuesta NPS (7 días), SLA vencido al equipo (4 h sin respuesta, 24 h sin cotizar).
- [ ] Admin `/admin/plantillas` para editar textos y previsualizar.

Aceptación: cada transición de estado genera la notificación correcta y visible en la solicitud; sin credenciales todo queda en `simulated` y se ve en consola.

## E6 — Panel interno · esfuerzo: high · semanas 6–7

Objetivo: bandeja, detalle, asignación, notas, roles y auditoría (§11).

- [ ] `/admin` protegido por rol; login por enlace mágico; menú: Bandeja, Pedidos, Catálogo, Plantillas, Reportes, Usuarios, Configuración.
- [ ] Bandeja: tabla con filtros (estado, segmento, fecha, cantidad, asignado, semáforo), orden por SLA vencido primero, contador de horas hábiles, asignación manual o "siguiente en turno".
- [ ] Detalle: ficha técnica por pieza, previsualización de arte y referencias, datos del cliente, historial de estados, notas internas, registro de contactos (nota manual con canal), botón "Pedir datos faltantes" que arma la plantilla con la lista exacta de campos faltantes.
- [ ] Cambio de estado con validación de la máquina de §14; motivo obligatorio en Rechazada (lista cerrada).
- [ ] Usuarios: invitar por correo, cambiar rol, desactivar. Auditoría: tabla `audit_log` con quién, qué, cuándo, antes/después.

Aceptación: un vendedor toma una solicitud, pide datos faltantes, recibe respuesta y la pasa a "RFQ enviado" sin salir del panel; el viewer no puede editar nada (test).

## E7 — RFQ y cotización · esfuerzo: high · semanas 7–8

Objetivo: RFQ a fábrica en PDF y Excel, registro de respuesta, cálculo de precio interno y cotización PDF con aceptación en un clic (§11, §13).

- [ ] Migración `006_quotes_rfq`: `factory_rfqs` (versión, documento_url, enviado_at, respondido_at, costos JSON por cantidad, moneda, tiempo_produccion_dias, observaciones) y `quotes` (número `C-AAAA-NNNNN-vN`, líneas JSON con costo, flete, margen %, precio unitario, subtotal; vigencia; condiciones; pdf_url; estado; aceptada_at; aceptada_por).
- [ ] Generador RFQ: PDF (`@react-pdf/renderer`) y Excel (SheetJS) con ficha técnica completa por pieza, códigos de catálogo, cantidades, arte adjunto si `released`; envío por correo a `FACTORY_EMAIL` y registro; formato de columnas en `config/rfq-format.ts` para adaptarlo al de la fábrica.
- [ ] Formulario de respuesta de fábrica (manual): costo por cantidad, tiempo, notas.
- [ ] Calculadora interna: flete estimado (campo manual), margen por línea editable con valor por defecto en `settings.default_margin_pct` (35 % provisional), precio unitario y subtotal; nunca visible al cliente.
- [ ] Cotización PDF con marca, precios por cantidad, vigencia (`settings.quote_validity_days`), condiciones 50/50, plazo estimado, notas; versiones; envío por correo y wa.me; página `/seguimiento/[token]` con botón "Aceptar cotización" (registra fecha, usuario, IP) o "Pedir cambios" (texto libre → actividad).
- [ ] Al aceptar: estado Aceptada y creación automática del pedido (E8 deja el gancho).

Aceptación: de una solicitud verde se genera RFQ sin retipear nada, se registra costo, se emite cotización y el cliente la acepta desde su enlace; la cotización rechazada exige motivo.

## E8 — Pedidos y seguimiento · esfuerzo: high · semanas 8–9

Objetivo: pedido con hitos, evidencias de QA, pagos y vista del cliente (§6, §10, §11).

- [ ] Migración `007_orders`: `orders` (número `P-AAAA-NNNNN`, cotización_id, estado, fecha_estimada_entrega, dirección, transporte, tracking, ETA, notas), `milestones` (tipo enum de §14, fecha, responsable, evidencias JSON, checklist_qa JSON), `payments` (tipo `deposit|balance`, monto, moneda, método, referencia, comprobante_url, fecha, confirmado_por).
- [ ] Creación automática al aceptar cotización; montos 50/50 calculados; fecha estimada por `lib/leadtime.ts` al confirmar anticipo y proof.
- [ ] Admin pedido: línea de tiempo, subir fotos y video por hito (bucket `evidence`), checklist QA contra la especificación (puntos generados desde la ficha: material, calibre, medidas, colores, acabado, cantidad), registrar pagos con comprobante, alertas de retraso.
- [ ] Vista cliente `/seguimiento/[token]`: línea de tiempo, evidencias, documentos (cotización, ficha, comprobante), montos y estado de pagos, subir comprobante, botón "pedir de nuevo" (abre wizard precargado).
- [ ] Recordatorios de saldo y encuesta NPS (formulario simple, guarda en `surveys`).

Aceptación: pedido completo de anticipo a cerrado con hitos, fotos y saldo; el cliente ve una foto de QA en menos de un minuto tras subirla.

## E9 — Calidad y seguridad · esfuerzo: medium · semana 9

- [ ] Playwright: recorrido completo cliente + staff (solicitud → RFQ → cotización → aceptación → pedido → cerrado).
- [ ] Revisión OWASP Top 10: RLS en todas las tablas (test que intenta leer datos ajenos y falla), rate limit en formularios, captcha invisible (Turnstile por variable de entorno, opcional), validación de tipo de archivo, cabeceras de seguridad, sin secretos en cliente.
- [ ] Rendimiento: Lighthouse móvil ≥ 90 en inicio, ficha y paso 1 del wizard; bundle del wizard < 250 kB gz.
- [ ] Accesibilidad: axe sin errores críticos en las páginas públicas y el wizard.
- [ ] Respaldos: script y doc para `pg_dump` diario; Sentry opcional conectado.
- [ ] `/admin/reportes`: pipeline por estado, tiempos por etapa, conversión, top tipos y materiales, motivos de pérdida, pedidos por vencer, tráfico por canal; exportación CSV.

Aceptación: todos los tests en verde en CI; informe de seguridad en `docs/seguridad.md`; CSV de reportes abre en Google Sheets sin retoques.

## E10 — Lanzamiento · esfuerzo: medium · semana 10

- [ ] `docs/lanzamiento.md`: lista de lo que Mark debe entregar (fotos con código de muestra, textos definitivos, nombre y dominio, credenciales de Supabase, Resend, WhatsApp, GA4, Meta Pixel, correo de fábrica) y cómo cargarlo.
- [ ] Script de importación de fotos de la galería desde una carpeta con nombres `M-001.jpg` → `gallery_samples`.
- [ ] Guía de uso del panel para el equipo (`docs/manual-equipo.md`) con capturas.
- [ ] Revisión final de textos legales y de que ninguna pantalla pública muestra precio, logos de clientes ni sellos de certificación.
- [ ] Checklist de despliegue en `docs/deploy.md` verificado paso a paso en local.

Aceptación: criterio de salida del MVP de §18 cumplido con una solicitud real de cada segmento.

---

## Fase 2 (no ejecutar hasta que Mark lo pida)

| # | Bloque | Esfuerzo |
| --- | --- | --- |
| F2-1 | Portal con cuentas por empresa, varios usuarios y recompra en un clic | high |
| F2-2 | Plantillas de troquel por tipo y tamaño + preflight automático (Ghostscript/pdf-lib) | ultracode |
| F2-3 | Motor de precios interno: matriz de costos de fábrica, flete por destino, márgenes por segmento (solo uso interno) | ultracode |
| F2-4 | WhatsApp Business Cloud API bidireccional | high |
| F2-5 | Pago en línea del anticipo | high |
| F2-6 | Portal de fábrica para responder RFQ y subir avances | high |
| F2-7 | Versión en inglés | medium |
| F2-8 | Reportes avanzados y sincronización con CRM | medium |
