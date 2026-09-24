# CLAUDE.md — Plataforma web y cotizador de empaques

Fuente de verdad: `docs/PRD.md` (21 secciones). Cola de trabajo: `TAREAS.md`. Decisiones ya tomadas: sección "Decisiones provisionales" de `TAREAS.md`. Este archivo manda sobre cualquier otro cuando haya conflicto.

## Modo de trabajo (no negociable)

1. Ejecuta los bloques de `TAREAS.md` en orden (E0 → E10) sin detenerte a preguntar. Si una duda no está resuelta en `TAREAS.md`, decide tú con el criterio más simple que cumpla el PRD, anótala en `docs/DECISIONES.md` (fecha, duda, decisión, cómo cambiarla) y sigue.
2. Usa exactamente el nivel de esfuerzo indicado en cada bloque (medium / high / ultracode). No subas a ultracode por tu cuenta.
3. Guarda avance de forma incremental: un commit por sub-tarea terminada (mensaje `E3: wizard paso 4 material`), y al cerrar cada bloque actualiza `docs/AVANCE.md` (qué quedó hecho, qué falta, cómo probarlo) y marca `[x]` en `TAREAS.md`. Nunca dejes trabajo solo en memoria.
4. Al terminar un bloque, corre sus criterios de aceptación (tests + verificación manual descrita) antes de pasar al siguiente. Si algo falla, arréglalo dentro del mismo bloque.
5. Nunca pagues, compres ni crees servicios de pago (dominios, certificados, planes, proyectos de pago en Supabase o Vercel). Si falta una credencial, deja el código listo con variables de entorno documentadas en `.env.example` y un modo local o simulado que funcione sin ella.
6. No inventes datos de negocio. Los valores de catálogo, precios, plazos o certificaciones que no estén en el PRD se cargan como `is_provisional = true` y se muestran con la etiqueta "PROVISIONAL" en el panel interno, nunca como hechos en la web pública.
7. Nunca muestres un precio al cliente, ni estimado, ni rango, en ninguna pantalla pública ni en el portal. El precio solo existe en el panel interno y en la cotización PDF que emite el equipo.
8. El nombre del dueño se escribe "Mark Marcel Harrick Atie", sin "Ing." ni ningún título, en todo documento, plantilla o firma.

## Stack fijo

- Next.js (App Router) + TypeScript estricto + Tailwind CSS + shadcn/ui. Node 20+, pnpm.
- Supabase: Postgres con RLS en todas las tablas, Auth por enlace mágico, Storage privado con URLs firmadas. Migraciones en `supabase/migrations`, datos maestros en `supabase/seed.sql`. Si no hay `SUPABASE_URL`/keys en `.env`, usa Supabase local (`supabase start`) y deja las migraciones listas para el proyecto real.
- Vercel para la app (solo `vercel.json` y README de despliegue; no despliegues sin token).
- Correo transaccional: Resend. Sin `RESEND_API_KEY` los correos se escriben en consola y en la tabla `notifications` con estado `simulated`.
- WhatsApp MVP: enlaces `wa.me/<numero>?text=...` con texto precargado. Número en `NEXT_PUBLIC_WHATSAPP_NUMBER`.
- PDF: `@react-pdf/renderer` en rutas de servidor (ficha técnica, RFQ, cotización).
- Tareas programadas: `vercel.json` crons llamando a rutas `/api/cron/*` protegidas por `CRON_SECRET`.
- Analytics: GA4 y Meta Pixel por variables de entorno; si faltan, los helpers no hacen nada.
- Errores: Sentry por variable de entorno; opcional.
- Tests: Vitest para lógica (compatibilidades, semáforo, numeración, plazos) y Playwright para el wizard de punta a punta.
- i18n: todos los textos en `messages/es.json` (next-intl) aunque solo exista español; nada de texto fijo en componentes.

## Estructura de carpetas

```
app/
  (public)/        sitio público: inicio, catalogo, galeria, como-funciona, sostenibilidad, clientes, faq, contacto, legal
  cotizar/         wizard del cotizador (pasos 0-9) + resumen
  seguimiento/[token]/   vista del cliente por enlace seguro
  admin/           panel interno (protegido por rol)
  api/             rutas de servidor: pdf, cron, webhooks
components/        UI reutilizable (shadcn + propios)
lib/               supabase clients, reglas de negocio, numeración, semáforo, compatibilidades, plazos
messages/es.json   textos
supabase/          migrations, seed.sql, policies
docs/              PRD.md, DECISIONES.md, AVANCE.md, deploy.md
tests/             vitest + playwright
```

## Convenciones

- Español en UI y en nombres de campos de negocio expuestos al usuario; inglés en código (tablas, columnas, funciones).
- Tablas en `snake_case`; toda tabla lleva `id uuid`, `created_at`, `created_by`, `updated_at`, `updated_by`.
- Estados como enums de Postgres, con la máquina de estados de PRD §14 validada en base de datos (trigger) y en `lib/states.ts`.
- Móvil primero; LCP < 2,5 s en móvil; imágenes en WebP con `next/image`.
- Cada bloque termina con `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde.
- Sin `console.log` en producción; usa el logger de `lib/log.ts`.

## Qué NO hacer

- No agregar librerías pesadas de UI aparte de shadcn/ui.
- No usar localStorage para datos de negocio (solo para el borrador del wizard como respaldo; la verdad está en `quote_drafts`).
- No poner secretos en el código ni en el repositorio.
- No cambiar el orden ni el alcance de los bloques; si crees que algo debe moverse, anótalo en `docs/DECISIONES.md` y sigue el orden.
