# Avance del proyecto

Estado por bloque de `TAREAS.md`. Se actualiza al cerrar cada bloque.

| Bloque | Estado | Fecha de cierre |
| --- | --- | --- |
| E0 — Base del proyecto | ✅ Hecho | 24/09/2026 |
| E1 — Datos maestros y admin | ✅ Hecho | 24/09/2026 |
| E2 — Sitio público | ✅ Hecho | 24/09/2026 |
| E3 — Cotizador | ⏳ Pendiente | — |
| E4 — Arte y referencias | ⏳ Pendiente | — |
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
