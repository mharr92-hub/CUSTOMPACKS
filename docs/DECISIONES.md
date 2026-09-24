# Registro de decisiones

Decisiones tomadas durante la construcción que no estaban resueltas en `TAREAS.md` (las "Decisiones provisionales" de `TAREAS.md` siguen vigentes y no se repiten aquí). Formato: fecha · duda · decisión · cómo cambiarla.

---

### D-001 · 24/09/2026 · Archivos duplicados al iniciar
- **Duda:** la carpeta tenía copias con nombres cruzados (`PRD (1).md` y `PRD (2).md` eran copias de `TAREAS.md`, y `TAREAS (1..3).md` eran copias de `CLAUDE.md`).
- **Decisión:** se verificó con md5 que eran idénticas byte a byte y se borraron. `PRD.md` se movió a `docs/PRD.md`, que es donde lo espera `CLAUDE.md`.
- **Cómo cambiarla:** no aplica.

### D-002 · 24/09/2026 · Base de datos local sin Docker
- **Duda:** `CLAUDE.md` pide `supabase start` si no hay credenciales, pero en la máquina no hay Docker (y la CLI de Supabase lo necesita para `start`).
- **Decisión:** se usa Postgres 17 real embebido (`embedded-postgres`, binarios oficiales) en el puerto 54322, el mismo que usa Supabase local. Un *shim* (`supabase/local/supabase-shim.sql`) reproduce lo que usan las migraciones: roles `anon`, `authenticated` y `service_role`, `auth.users`, `auth.uid()`/`auth.jwt()`, `storage.buckets` y los privilegios por defecto del esquema `public`. Las migraciones de `supabase/migrations` son las mismas que se aplican al proyecto real con `supabase db push`. El shim nunca se aplica en producción.
- **Cómo cambiarla:** con Docker instalado, `pnpm dlx supabase start` funciona con la misma carpeta `supabase/`; pon `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres` y las claves locales en `.env.local`.

### D-003 · 24/09/2026 · Cómo lee y escribe datos la app
- **Duda:** usar `supabase-js`/PostgREST o SQL directo.
- **Decisión:** la app habla con Postgres por SQL (driver `postgres`) desde el servidor, tanto en local como en Supabase (pooler en modo transacción). Las políticas RLS se respetan igual que en Supabase: cada consulta corre en una transacción con `SET LOCAL ROLE anon|authenticated` y `request.jwt.claims`, así que `auth.uid()` funciona igual (`lib/db/actor.ts`). Supabase se usa para **Auth** (enlace mágico) y **Storage** (buckets privados, URLs firmadas). El acceso por enlace seguro (seguimiento, borrador) se valida en RLS mediante `app.access_token`, una variable que solo fija el servidor.
- **Por qué:** un solo camino de datos que funciona sin credenciales y con RLS real en los tests.
- **Cómo cambiarla:** las consultas están concentradas en `lib/` por dominio; se pueden portar a `supabase-js` sin tocar las políticas.

### D-004 · 24/09/2026 · Next.js 16
- **Duda:** la versión instalada es Next.js 16.3, con cambios importantes respecto a la 15.
- **Decisión:** se siguen sus convenciones: `proxy.ts` en lugar de `middleware.ts` (runtime Node), APIs de request asíncronas (`await params`, `await cookies()`), `revalidateTag(tag, perfil)`, ESLint por CLI (`next lint` ya no existe) y `pnpm typecheck` = `next typegen && tsc --noEmit` (los tipos `PageProps`, `LayoutProps` y `RouteContext` se generan). Cache Components queda desactivado (modelo clásico con `revalidate`/`dynamic`).
- **Cómo cambiarla:** activar `cacheComponents` en `next.config.ts` implicaría migrar `revalidate`/`dynamic` a `"use cache"`.

### D-005 · 24/09/2026 · Tokens de color con Tailwind 4
- **Duda:** `TAREAS.md` menciona `tailwind.config`, pero Tailwind 4 configura el tema en CSS.
- **Decisión:** los tokens de marca (kraft, verde bosque, negro, papel, semáforo) viven en `app/globals.css` (`:root` y `@theme inline`) y se reflejan en `config/brand.ts`.
- **Cómo cambiarla:** editar las variables de `:root` en `app/globals.css`.

### D-006 · 24/09/2026 · Componentes shadcn/ui 4
- **Duda:** shadcn 4 ya no incluye `toast` ni `form` en el registro.
- **Decisión:** base Radix con el preset "vega"; `toast` se reemplaza por `sonner` y `form` por `field` (+ `label`), que son los reemplazos oficiales. Se agregaron `checkbox`, `radio-group`, `separator`, `sheet`, `dropdown-menu`, `progress` y `tooltip`. Los textos fijos en inglés de los componentes ("Close") salen de `messages/es.json`.
- **Cómo cambiarla:** `pnpm dlx shadcn@latest add <componente>`.

### D-007 · 24/09/2026 · Tipografía local
- **Decisión:** Inter variable servida desde el propio sitio con `next/font/local` (archivo de `@fontsource-variable/inter`), sin depender de Google Fonts en el build.
- **Cómo cambiarla:** cambiar `src` en `app/layout.tsx`.

### D-008 · 24/09/2026 · Solo tema claro
- **Decisión:** el MVP no tiene modo oscuro (sitio de marca con paleta papel/kraft); se eliminaron las variables `.dark`.
- **Cómo cambiarla:** añadir un bloque `.dark` en `app/globals.css` y un selector de tema.

### D-009 · 24/09/2026 · Página "Nosotros"
- **Duda:** el mapa del sitio de §17 incluye "Nosotros", pero la lista de páginas de E2 no la menciona.
- **Decisión:** se crea `/nosotros` en E2, con textos que solo usan lo que dice el PRD.
- **Cómo cambiarla:** quitar el enlace de `config/navigation.ts`.

### D-010 · 24/09/2026 · Datos de contacto de ejemplo
- **Decisión:** WhatsApp `50760000000` y correo `hola@provenpack.com` son valores de ejemplo en `.env.example` y en `config/brand.ts`. `docs/lanzamiento.md` pide los reales.
- **Cómo cambiarla:** `NEXT_PUBLIC_WHATSAPP_NUMBER` y `NEXT_PUBLIC_CONTACT_EMAIL`.

### D-011 · 24/09/2026 · Repositorio remoto
- **Decisión:** el repositorio local apunta a `https://github.com/mharr92-hub/CUSTOMPACKS` (rama `main`). Se hace commit por subtarea y `push` al cerrar cada bloque si hay credenciales de GitHub en la máquina. Si el push falla, el trabajo queda en commits locales y se indica en `docs/AVANCE.md`.
- **Cómo cambiarla:** `git remote set-url origin <url>`.

### D-012 · 24/09/2026 · Tamaño máximo de archivo en Storage
- **Duda:** el PRD pide 100 MB por archivo, pero el plan Free de Supabase limita cada archivo a 50 MB.
- **Decisión:** la app valida contra `settings.max_file_mb` (100) y el bucket se crea con límite de 100 MB. En Supabase Free las subidas de más de 50 MB fallarán hasta pasar a Pro; en local no hay límite. No se contrata nada (regla 5 de `CLAUDE.md`).
- **Cómo cambiarla:** bajar `max_file_mb` a 50 en admin > Configuración mientras se use el plan Free.

### D-013 · 24/09/2026 · Frecuencia de crons en Vercel
- **Duda:** el SLA (4 h sin respuesta) necesita un cron frecuente, pero el plan Hobby de Vercel solo permite crons diarios.
- **Decisión:** `vercel.json` declara los crons diarios (vigencia, saldo, NPS, retención). El SLA también se recalcula al abrir la bandeja del panel, así que funciona sin cron horario. El cron horario de SLA queda documentado para cuando haya plan Pro.
- **Cómo cambiarla:** en Pro, agregar `{"path": "/api/cron/sla", "schedule": "0 * * * *"}` a `vercel.json`.

### D-014 · 24/09/2026 · Tests con base de datos
- **Decisión:** `pnpm test` corre dos proyectos de Vitest: `unit` (lógica pura) y `db` (migraciones, RLS y triggers contra un Postgres embebido efímero que se crea y destruye en cada corrida). En CI se usa el mismo mecanismo (binarios Linux). `TEST_DATABASE_URL` permite apuntar a otro Postgres.
- **Cómo cambiarla:** `vitest.config.mts`.
