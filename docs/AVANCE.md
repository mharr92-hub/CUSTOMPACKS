# Avance del proyecto

Estado por bloque de `TAREAS.md`. Se actualiza al cerrar cada bloque.

| Bloque | Estado | Fecha de cierre |
| --- | --- | --- |
| E0 — Base del proyecto | ✅ Hecho | 24/09/2026 |
| E1 — Datos maestros y admin | ⏳ Pendiente | — |
| E2 — Sitio público | ⏳ Pendiente | — |
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
- El CI se verifica al hacer push. Si no hay credenciales de GitHub en la máquina, los commits quedan locales (ver el resultado al final de este bloque).

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
