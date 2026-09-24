# ProvenPack — plataforma web y cotizador de empaques

Sitio público con catálogo, cotizador guiado de 9 pasos, portal de seguimiento por enlace seguro y panel interno para validar solicitudes, pedir costos a fábrica, emitir cotizaciones y seguir pedidos hasta el cobro del saldo.

- Fuente de verdad: [`docs/PRD.md`](docs/PRD.md)
- Reglas de trabajo: [`CLAUDE.md`](CLAUDE.md)
- Cola de bloques: [`TAREAS.md`](TAREAS.md)
- Avance y cómo probar cada bloque: [`docs/AVANCE.md`](docs/AVANCE.md)
- Decisiones tomadas: [`docs/DECISIONES.md`](docs/DECISIONES.md)
- Despliegue: [`docs/deploy.md`](docs/deploy.md)

## Arranque rápido

Requisitos: Node 20.9 o superior y pnpm. **No hace falta Docker ni credenciales.**

```bash
pnpm install
pnpm dev          # levanta Postgres local (:54322), aplica migraciones y seed, abre http://localhost:3000
```

Sin credenciales todo funciona en modo local:
- **Base de datos:** Postgres 17 embebido en `.data/postgres`.
- **Login:** el enlace mágico se imprime en la consola.
- **Correos:** se registran como `simulated`.
- **Archivos:** se guardan en `.data/storage`.

Para usar servicios reales, copia `.env.example` a `.env.local` y completa las variables.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Postgres local + `next dev` |
| `pnpm build` / `pnpm start` | Build y servidor de producción |
| `pnpm lint` | ESLint (incluye la regla de "sin texto fijo en JSX") |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest: lógica (`unit`) y base de datos con RLS (`db`) |
| `pnpm test:e2e` | Playwright (móvil y escritorio) |
| `pnpm db:reset` | Recrea la base local (shim + migraciones + seed) |
| `pnpm db:migrate` / `pnpm db:seed` | Migraciones pendientes / datos maestros |

## Estructura

```
app/            (public) sitio · cotizar/ wizard · seguimiento/[token]/ · admin/ · api/
components/     UI (shadcn/ui en components/ui) y componentes propios
config/         marca, navegación, formato RFQ
lib/            db, auth, reglas de negocio (compatibilidades, semáforo, plazos, numeración)
messages/       textos (es.json)
supabase/       migrations, seed.sql, config.toml, local/ (shim para Postgres local)
scripts/        base local, dev, importación de galería
tests/          unit, db, e2e
docs/           PRD, decisiones, avance, despliegue
```
