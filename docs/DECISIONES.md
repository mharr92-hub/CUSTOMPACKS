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

### D-015 · 24/09/2026 · Bucket público para fotos del catálogo
- **Duda:** `CLAUDE.md` pide Storage privado con URLs firmadas, pero las fotos del catálogo y la galería son contenido público de marketing.
- **Decisión:** el bucket `catalog` es público (con CDN de Supabase y `next/image`). El arte de clientes, las evidencias de QA y los documentos van en buckets privados con URLs firmadas de corta duración.
- **Cómo cambiarla:** marcar `catalog` como privado en `lib/storage` y `storage.buckets` y servir las fotos con URLs firmadas.

### D-016 · 24/09/2026 · Los 12 tipos de caja, 6 bolsas y familias de tamaños
- **Duda:** §7 da 17 candidatos de caja y 7 de bolsa, sin decir cuáles son los reales.
- **Decisión (provisional):**
  - Cajas: plegadiza con tapa, autoarmable de fondo automático, bandeja, dos piezas, rígida, mailer, gable con asa, clamshell, cono para papas, balde para pollo, pizza, y torta/pastelería.
  - Quedan fuera: reverse tuck (muy similar a la plegadiza), RSC de corrugado, sándwich/wrap, caja con ventana (es un acabado) y sleeve.
  - Bolsas: kraft con asa plana, kraft con asa retorcida, boutique laminada, SOS, delivery y antigrasa. Queda fuera el sobre con ventana.
  - Los tamaños S1–S10 se agrupan en 3 familias con medidas interiores genéricas: `box`, `bag` y `food_box`. Todo va con `is_provisional = true`.
- **Cómo cambiarla:** editar o desactivar desde admin > Catálogo.

### D-017 · 24/09/2026 · Semántica de compatibilidades
- **Decisión:** en `compatibilities` una regla `allowed=true` crea una lista blanca (por ejemplo, "el balde exige antigrasa" es una sola fila) y `allowed=false` excluye con un motivo. La regla exacta tipo+papel+calibre manda sobre la general. Detalle y tests en `lib/compat.ts`. Las 6 reglas de ejemplo del seed son:
  - Balde y cono exigen papel antigrasa.
  - La caja rígida no admite microcorrugado.
  - El mailer no admite calibre ligero.
  - La bolsa boutique exige papel estucado.
  - La bolsa antigrasa exige papel antigrasa.
- **Cómo cambiarla:** matriz en admin > Catálogo > Compatibilidades.

### D-018 · 24/09/2026 · Quién edita el catálogo
- **Decisión:** solo el rol `admin` escribe catálogo, compatibilidades y configuración. `sales`, `ops` y `viewer` leen todo, incluido lo inactivo. Lo aplican las políticas RLS de `002_auth` y cada Server Action.
- **Cómo cambiarla:** políticas `*_admin_write` en una migración nueva.

### D-019 · 24/09/2026 · Acceso al panel por enlace mágico
- **Decisión:** solo `ADMIN_EMAIL` puede crear su cuenta con el enlace mágico. El resto del equipo entra por invitación (E6). La respuesta del login no revela si un correo existe. En modo local, sin correo real, el enlace se muestra en pantalla fuera de producción; en producción solo si `ALLOW_LOCAL_AUTH_LINKS=true`.
- **Cómo cambiarla:** `requestStaffMagicLink` en `lib/auth/index.ts`.

### D-020 · 24/09/2026 · Muestras de galería de referencia
- **Duda:** no hay fotos todavía, pero el sitio y el cotizador necesitan muestras para funcionar ("quiero algo así").
- **Decisión:** el seed carga 12 muestras de referencia (M-001 a M-012), provisionales y sin foto. El sitio muestra un marcador con el código, nunca fotos de terceros. `docs/lanzamiento.md` explica cómo reemplazarlas con el script de importación (E10).
- **Cómo cambiarla:** desactivarlas o borrarlas en admin > Catálogo > Galería.

### D-021 · 24/09/2026 · Caché del catálogo público
- **Decisión:** el catálogo público se lee como `anon` (RLS garantiza que solo sale lo activo) y se cachea 5 minutos con la etiqueta `catalog`. Cada guardado en el panel invalida la etiqueta al instante (`updateTag`).
- **Cómo cambiarla:** `lib/catalog/public.ts`.

### D-022 · 24/09/2026 · Claves de configuración adicionales
- **Decisión:** además de las de `TAREAS.md`, `settings` incluye estas claves (las no definidas por Mark van como provisionales):
  - `deposit_pct` (50) y `lead_time_days_small`/`lead_time_days_standard` (30/45), definidas por Mark.
  - `first_response_sla_hours` (4) y `quote_sla_hours` (24).
  - `business_hours` (lunes a viernes, 08:00–17:00, America/Panama).
  - `quote_expiry_reminder_days` [3, 1], `balance_reminder_days` [2, 5] y `nps_delay_days` (7).
- **Cómo cambiarla:** admin > Configuración.

### D-023 · 24/09/2026 · Identidad visual del sitio
- **Decisión:** el lenguaje gráfico sale del troquel:
  - Línea continua = corte, discontinua = pliegue.
  - Las fotos van enmarcadas con marcas de corte de imprenta.
  - El hero muestra el plano desplegado de una caja con sus cotas; es la única animación: se dibuja una vez y respeta "reducir movimiento".
  - Fondo blanco (cartulina), kraft como superficie de bloques clave, verde bosque para acciones y footer, y titulares en Inter 800 de tracking cerrado.
  - Numeración solo en "Cómo funciona", porque es una secuencia real.
- **Cómo cambiarla:** `components/site/dieline.tsx`, `.crop-frame` y tokens en `app/globals.css`.

### D-024 · 24/09/2026 · Sitio público casi sin JavaScript
- **Decisión:** el menú móvil es un `<details>` nativo (sin Radix) y un componente mínimo lo cierra al navegar. Los filtros del catálogo y la galería son enlaces o formularios GET. Los textos solo viajan al navegador en las secciones que tienen componentes cliente (panel y, luego, cotizador). `Toaster` y `Tooltip` viven solo en `/admin`. Así el sitio público carga solo el runtime de Next.
- **Cómo cambiarla:** `components/site/mobile-nav.tsx` y `components/intl-client-provider.tsx`.

### D-025 · 24/09/2026 · Fuente sin precarga y marcadores estáticos
- **Decisión:** Inter se sirve sin `preload`: el texto se pinta al instante con la fuente de respaldo ajustada por `next/font`. Los marcadores de foto son 4 SVG estáticos y cacheables (`public/placeholders`) con el código como texto, en lugar de un SVG en línea por tarjeta.
- **Cómo cambiarla:** `app/layout.tsx` y `components/catalog/code-placeholder.tsx`.

### D-026 · 24/09/2026 · LCP móvil de la página de inicio
- **Duda:** TAREAS pide LCP < 2,5 s en Lighthouse móvil.
- **Resultado medido en local** (`next start`, gzip, simulación de 4G lenta con CPU 4× más lenta):
  - Rendimiento 94–99 y SEO, accesibilidad y buenas prácticas en 100 en todas las páginas medidas.
  - LCP: fichas y catálogo 2,0–2,5 s; páginas interiores 2,4 s; inicio 2,6–2,9 s.
  - El LCP real observado sin estrangulamiento es de 0,1–0,4 s.
- **Qué se probó:**
  - Menú sin JS, fuente sin precarga y marcado más liviano: mejoraron.
  - CSS en línea: empeoró y se revirtió.
  - `content-visibility`: sin efecto en Lighthouse y falsos positivos de accesibilidad; se revirtió.
- **Por qué el inicio queda arriba:** es la página más larga (10 secciones de §17) y su LCP simulado queda por encima del resto.
- **Pendiente:** volver a medir en el preview de Vercel (brotli + CDN) en E9 con `node scripts/lighthouse.mjs <url> /`.
- **Cómo cambiarla:** si en Vercel sigue por encima de 2,5 s, reducir las secciones de la home (por ejemplo, 3 piezas destacadas en lugar de 6).

### D-027 · 24/09/2026 · Contacto sin formulario
- **Decisión:** `/contacto` ofrece WhatsApp, correo y el cotizador, sin formulario propio. TAREAS no lo pide, y un formulario sin notificaciones (E5) juntaría datos sin darles curso.
- **Cómo cambiarla:** agregar un formulario que cree una actividad y una notificación (después de E5).

### D-028 · 24/09/2026 · Enlaces hacia el cotizador desde el sitio
- **Decisión:**
  - "Cotizar esta pieza" abre `/cotizar?tipo=<código>`.
  - "Quiero algo así" abre `/cotizar?muestra=<código>`, y el wizard (E3) agrega esa muestra como referencia al borrador.
  - Mientras E3 no existe, `/cotizar` ofrece cotizar por WhatsApp.
- **Cómo cambiarla:** `lib/catalog/view.ts` (`quoteHref`) y `components/catalog/sample-card.tsx`.

### D-029 · 24/09/2026 · Textos legales y preguntas frecuentes
- **Decisión:**
  - Privacidad y términos son un borrador basado en el PRD (Ley 81 de 2019, 50/50, plazos, vigencia, tolerancias "según ficha técnica de fábrica"), marcado como "en revisión legal". La revisión final queda en E10.
  - Se agregó la pregunta "¿Por qué no veo el precio en línea?" (mitigación de §19).
  - La home muestra 3 preguntas y `/faq` todas.
- **Cómo cambiarla:** `messages/es.json` > `legal` y `faq`.

### D-030 · 24/09/2026 · E2E con base propia
- **Decisión:** Playwright levanta su servidor en :3100 con su propia base (`.data/postgres-e2e` en :54323, recreada en cada corrida), su propio almacenamiento (`.data/storage-e2e`) y su propio build (`.next-e2e`). Los datos de prueba nunca tocan la base de desarrollo. `pnpm db:reset` borra además la caché de datos de Next.
- **Cómo cambiarla:** `playwright.config.ts` y las variables `LOCAL_DB_*` de `scripts/dev.mjs`.

### D-031 · 24/09/2026 · Semáforo cuando falta el arte
- **Duda:** §8 pide rojo si falta el arte con impresión, y §9 ("Cliente sin arte") pide amarillo si el cliente marca "no tengo arte" o "necesito diseño".
- **Decisión:**
  - Con impresión y sin archivos: "Aún no tengo arte" y "Necesito que lo diseñen" dan amarillo (`artwork_pending` y `design`). "Tengo el arte" sin subir nada, o sin respuesta, da rojo (`artwork`).
  - Una pieza "No sé, sugiéranme" queda en rojo por "falta tipo", porque el equipo tiene que definirlo antes del RFQ.
- **Cómo cambiarla:** `lib/traffic-light.ts` y sus tests.

### D-032 · 24/09/2026 · Los tokens nunca van en URLs que ve la analítica
- **Duda:** GA4 y Meta Pixel registran la URL completa; el token del borrador y el de seguimiento dan acceso a datos personales.
- **Decisión:**
  - El wizard ya no escribe `?borrador=` en la barra de direcciones. El borrador vive en el servidor y en `localStorage`, y se comparte con "Guardar y seguir después".
  - `/cotizar?borrador=` (enlace de reanudación) no carga la analítica y, al abrir, limpia la URL a `/cotizar`.
  - La confirmación es `/cotizar/listo`. El token viaja en una cookie httpOnly (`pp_listo`, 24 h, solo para esa ruta). Desde ahí el seguimiento se abre con un enlace normal, sin navegación del lado del cliente.
  - `/seguimiento/[token]` y el PDF no cargan analítica.
  - El Pixel va sin eventos automáticos de botones (`autoConfig` en false).
- **Cómo cambiarla:** `components/analytics-scripts.tsx`, `app/cotizar/page.tsx`, `app/cotizar/listo/page.tsx` y `submitQuoteAction`.

### D-033 · 24/09/2026 · Datos personales del borrador y purga
- **Decisión:**
  - Mientras no se marque el consentimiento del paso 8, el servidor guarda el borrador sin los datos de contacto; quedan solo en el dispositivo. Al enviar ya hay consentimiento.
  - Un cron diario (`/api/cron/purge-drafts`, 03:30 hora de Panamá, con `CRON_SECRET`) borra los borradores vencidos (30 días sin cambios) que nunca se enviaron, con sus archivos. Las solicitudes enviadas no se tocan.
- **Cómo cambiarla:** `lib/quote/drafts.ts` (`stateForServer`, `purgeExpiredDrafts`) y `vercel.json`.

### D-034 · 24/09/2026 · Empresa de cada solicitud
- **Duda:** §13 define Empresa 1:N solicitudes, pero el cotizador es anónimo.
- **Decisión:** al enviar se busca la empresa:
  1. Por RUC. Se guarda normalizado, sin espacios y en mayúsculas, y es único.
  2. Si no hay RUC, por una solicitud anterior del mismo correo o WhatsApp. Si el cliente da un RUC nuevo, solo se reutiliza una empresa sin RUC.
  3. Si no se encuentra, se crea. Sin nombre de empresa, la persona figura como su propia cuenta (persona natural).
  - El panel (E6) podrá fusionar o corregir.
- **Cómo cambiarla:** `resolveCompany` en `lib/quote/submit.ts`.

### D-035 · 24/09/2026 · Qué se pregunta una vez y qué por pieza
- **Decisión:**
  - El segmento (paso 0), el producto (paso 1), la fecha deseada, el contacto y la entrega son de la solicitud.
  - Tipo, tamaño, material, impresión, cantidades, frecuencia, arte y referencias son de cada pieza.
  - Máximo 20 piezas por solicitud.
- **Cómo cambiarla:** `lib/quote/types.ts` y `lib/quote/flow.ts` (`MAX_PIECES`).

### D-036 · 24/09/2026 · "No sé" en tipo y en material
- **Decisión:**
  - "No sé, sugiéranme" en el tipo salta los pasos de tamaño, material e impresión de esa pieza. Desde ahí se puede agregar otra pieza, igual que desde el paso 5 y el resumen.
  - "No sé, asesórenme con el material" deja papel y calibre a propuesta del equipo.
  - Las dos opciones marcan la solicitud como "necesita asesoría".
- **Cómo cambiarla:** `lib/quote/flow.ts` y `lib/quote/validate.ts`.

### D-037 · 24/09/2026 · Números en formato de Panamá
- **Decisión:** en pantalla, en el PDF y en los mensajes, los miles van con coma (5,000). Al escribir se acepta 5000, 5.000, 5,000 o 5 000. Las medidas aceptan coma o punto decimal, con un decimal como máximo.
- **Cómo cambiarla:** `lib/quote/validate.ts` (parsers) y `Intl.NumberFormat("es-PA")`.

### D-038 · 24/09/2026 · Plazo en el cotizador
- **Decisión:**
  - El plazo en vivo usa la mayor cantidad de la solicitud, porque la producción se entrega junta: con más de 10,000 unidades, 45 días; si no, 30.
  - La fecha deseada es opcional. Si no llega, se avisa sin bloquear el envío.
  - El resumen, el paso 6 y la ficha PDF leen los días y el umbral desde `settings`.
- **Cómo cambiarla:** `lib/leadtime.ts` y admin > Configuración.

### D-039 · 24/09/2026 · Seguimiento y confirmación
- **Decisión:**
  - El cliente sigue su solicitud en `/seguimiento/[token]`, un enlace seguro sin cuenta, y descarga la ficha en `/api/pdf/ficha/[id]?t=token`. El equipo accede con sesión.
  - El correo de confirmación sale con `lib/mail` (simulado sin `RESEND_API_KEY`). E5 lo pasa a las plantillas de notificaciones.
  - Los valores que escribe el visitante van escapados en el HTML de todos los correos.
- **Cómo cambiarla:** `app/seguimiento`, `app/api/pdf/ficha` y `app/cotizar/actions.ts`.

### D-040 · 24/09/2026 · Segmento y tipos compatibles
- **Decisión:**
  - En el paso de tipo solo aparecen los tipos del segmento, con los exclusivos del segmento primero. "No estoy seguro" muestra todos.
  - Cambiar de segmento suelta los tipos que dejan de servir. El servidor rechaza un tipo que no corresponde al segmento.
  - Un tipo solo alimentario exige aptitud alimentaria aunque el segmento sea "No estoy seguro".
  - Si el tipo precargado tiene un único segmento, ese segmento queda elegido.
- **Cómo cambiarla:** `typeFitsSegment` y `needsFoodAttributes` en `lib/quote/validate.ts`.

### D-041 · 24/09/2026 · "Cotizar esta pieza" y "Quiero algo así" con un borrador en curso
- **Decisión** (precisa D-028): la precarga se suma al borrador del dispositivo y nunca lo reemplaza.
  - El tipo va a la pieza que ya lo tenga, a una pieza vacía o a una pieza nueva.
  - La muestra queda como referencia de esa pieza.
  - Si el tipo no sirve para el segmento ya elegido, el segmento pasa a "No estoy seguro".
  - Un aviso dice qué se agregó.
- **Cómo cambiarla:** `applyPreload` en `lib/quote/flow.ts`.

### D-042 · 24/09/2026 · Borradores
- **Decisión:**
  - Autoguardado en `localStorage` al instante y en el servidor 1,2 s después del último cambio.
  - Si falla el guardado, se avisa con texto visible y un botón "Reintentar".
  - El borrador vence a los 30 días sin cambios.
  - "Guardar y seguir después" envía el enlace por correo (máximo 3 por borrador cada 24 h) o por WhatsApp, o permite copiarlo.
- **Cómo cambiarla:** `components/wizard/wizard.tsx` y `RESUME_EMAILS_PER_DAY` en `lib/quote/drafts.ts`.

### D-043 · 24/09/2026 · Navegación accesible del wizard
- **Decisión:**
  - En el paso 0 (segmento), tocar o hacer clic en una opción avanza solo. Con teclado, las flechas solo cambian la opción y se avanza con "Continuar" (WCAG 3.2.2).
  - Los errores visibles no pasan de un paso a otro. "Ir al paso" desde el resumen marca y enfoca lo que falta, y al continuar vuelve al resumen.
  - "Quitar" una pieza ofrece "Deshacer" en lugar de un diálogo de confirmación.
- **Cómo cambiarla:** `OptionCard` en `components/wizard/fields.tsx` y `components/wizard/step-summary.tsx`.

### D-044 · 24/09/2026 · Fotos en las opciones técnicas
- **Decisión:** tamaños, papeles, calibres e impresión muestran foto cuando el catálogo la tiene. Sin foto no se muestra un marcador genérico, porque un dibujo de caja no explica un papel. Los tipos siempre tienen imagen (foto o marcador con su código).
- **Cómo cambiarla:** `OptionPhoto` en `components/wizard/steps-piece.tsx`.

### D-045 · 24/09/2026 · Analítica del embudo del cotizador
- **Decisión:** eventos
  - `wizard_step_view`, `wizard_step_complete` (el paso 6 lleva un rango de cantidad) y `wizard_step_error` con los campos.
  - `wizard_option` con el paso, el campo y el código de catálogo elegido.
  - `wizard_add_piece`, `wizard_prefer_talk`, `wizard_save_later_*`, `wizard_submit` y el estándar `generate_lead`/`Lead`.
  - Nunca datos personales.
- **Cómo cambiarla:** `lib/quote/option-events.ts` y `components/wizard/wizard.tsx`.

### D-046 · 24/09/2026 · Archivos subidos antes de enviar la solicitud
- **Duda:** en el paso 7 todavía no existe la solicitud, pero el arte tiene que subirse ahí.
- **Decisión:**
  - El archivo sube directo al bucket privado `artwork` con una URL firmada, en `drafts/<token>/<pieza>/<tipo>/…`.
  - Al confirmar la subida, el servidor verifica el tipo real (magic bytes) y el tamaño, y lo registra en `quote_draft_files`. La lista que manda el navegador no cuenta.
  - Al enviar, solo los archivos verificados pasan a `artwork_files` (versión 1, 2… en "Recibido") y a `quote_references` (fotos). El archivo no se mueve de ruta.
  - Los borradores abandonados se borran con sus archivos (cron de D-033).
- **Cómo cambiarla:** `lib/artwork/uploads.ts` y `withVerifiedFiles` en `lib/quote/submit.ts`.

### D-047 · 24/09/2026 · Fechas con el mes en letras
- **Duda:** `Intl` con es-PA escribe las fechas como mes/día (09/24/2026), y en Panamá se lee también día/mes.
- **Decisión:** las fechas visibles llevan el mes en letras ("24 sept 2026, 9:15 p. m."), con zona horaria America/Panama.
- **Cómo cambiarla:** `lib/format.ts`.

### D-048 · 24/09/2026 · Quién abre los archivos de arte
- **Decisión:**
  - El cliente ve y abre los archivos de su solicitud con su enlace.
  - Todo el equipo ve que hay archivos (nombre, versión, estado), porque la bandeja lo necesita.
  - Abrir, descargar, revisar y subir proofs queda para el equipo asignado a la solicitud y admin (`can_access_request_files`). Se valida en la base y en el servidor antes de firmar la URL, que vence a los 5 minutos.
  - En modo local, los archivos que no son PDF se sirven aislados (CSP `sandbox`, `nosniff`) para que un SVG subido no ejecute nada en el sitio.
- **Cómo cambiarla:** `supabase/migrations/004_artwork.sql`, `lib/artwork/staff.ts` y `app/api/storage/object/route.ts`.

### D-049 · 24/09/2026 · Flujo de revisión del arte y del proof
- **Decisión:** cada archivo tiene su propio estado.
  - Arte: Recibido → En revisión → Con observaciones o Aprobado para proof. Una versión corregida es un archivo nuevo, versión n+1.
    - "Aprobado para proof" exige los 8 puntos del checklist (§21-B) en Correcto o No aplica.
    - "Con observaciones" exige al menos un punto observado o un comentario. El cliente ve cada punto con su nota.
  - Proof: solo se sube si hay una versión aprobada para proof. Pasa por Proof enviado → Proof aprobado → Liberado a fábrica.
    - "Proof aprobado" solo lo registra el cliente. Un trigger lo impide a cualquier otro.
    - La aprobación guarda fecha y hora, nombre, correo, IP y navegador, y no se puede editar ni borrar.
- **Cómo cambiarla:** `lib/artwork/states.ts` y los triggers de `004_artwork`.

### D-050 · 24/09/2026 · Retención del arte
- **Duda:** §9 propone 24 meses "después del último pedido", pero los pedidos llegan en E8.
- **Decisión:**
  - Hasta E8, la última actividad es la más reciente entre el último cambio de estado de la solicitud y el último archivo subido. E8 la cambia a la fecha del último pedido.
  - Un cron diario (`/api/cron/artwork-retention`) solo marca lo vencido.
  - Admin revisa y confirma en `/admin/archivos`. Al confirmar se borra el archivo del almacenamiento; el registro de la versión y su aprobación quedan.
- **Cómo cambiarla:** `lib/artwork/retention.ts` y `artwork_retention_months` en Configuración.

### D-051 · 24/09/2026 · Vista previa de archivos
- **Decisión:**
  - Las imágenes se muestran tal cual.
  - En PDF y AI se dibuja la primera página con pdf.js, cargado solo cuando hace falta, hasta 15 MB (un PDF de 80 MB no se descarga en el celular solo para la miniatura).
  - EPS, SVG y los archivos grandes muestran un ícono con el formato y el nombre.
- **Cómo cambiarla:** `components/upload/file-preview.tsx`.

### D-052 · 24/09/2026 · Pantalla de la solicitud en el panel
- **Decisión:** E4 crea `/admin/solicitudes/[id]` con el arte y los proofs de cada pieza, y la revisión de preprensa. La bandeja, la asignación, las notas y el resto del detalle se suman en E6, sobre la misma página.
- **Cómo cambiarla:** `app/admin/(panel)/solicitudes/[id]`.
