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

### D-053 · 24/09/2026 · Cómo salen las notificaciones
- **Decisión:**
  - Los cambios de estado encolan los mensajes desde la base: triggers sobre el historial de la solicitud y sobre el arte. Así ningún camino se salta un aviso.
  - El servidor los redacta con la plantilla vigente y los envía al terminar la respuesta de la acción que los disparó (`after()`).
  - Cada mensaje se bloquea mientras se envía, tiene una clave única contra duplicados y hasta 3 intentos.
  - Si a una plantilla le falta un dato (p. ej. el número de cotización), el mensaje queda "Falló" con la lista de variables faltantes y no se envía incompleto.
  - Todo envío queda en `activities` de la solicitud.
- **Cómo cambiarla:** `supabase/migrations/005_notifications.sql` y `lib/notify/index.ts`.

### D-054 · 24/09/2026 · Procesos programados sin plan pago
- **Duda:** el plan gratuito de Vercel solo permite crons diarios, y el SLA de 4 horas necesita revisarse más seguido.
- **Decisión:**
  - Crons diarios en `vercel.json`: `/api/cron/notifications` (SLA y cola), `/api/cron/purge-drafts` y `/api/cron/artwork-retention`.
  - Además, el uso del panel pone al día la cola y revisa el SLA como máximo cada 10 minutos (`job_runs`).
  - Cada acción que cambia un estado envía sus avisos al instante.
- **Cómo cambiarla:** con un plan que permita crons frecuentes, programar `/api/cron/notifications` cada 15 minutos.

### D-055 · 24/09/2026 · WhatsApp en el MVP
- **Decisión:** WhatsApp es click-to-chat (§12).
  - El aviso queda "Simulado", con el enlace wa.me al número del cliente y el texto de la plantilla.
  - En la solicitud, el equipo pulsa "Abrir WhatsApp", lo envía desde su teléfono y lo marca "Enviado"; queda quién y cuándo.
  - Con la API oficial (fase 2), el mismo registro pasa a enviarse solo.
- **Cómo cambiarla:** la rama `whatsapp` de `deliver` en `lib/notify/index.ts`.

### D-056 · 24/09/2026 · Avisos al equipo
- **Decisión:**
  - Los avisos internos (solicitud nueva, cotización aceptada, SLA vencido) van al correo de `team_notification_email`. Esta clave es PROVISIONAL y, vacía, usa el correo de admin.
  - El saludo al cliente usa solo su primer nombre.
- **Cómo cambiarla:** admin > Configuración.

### D-057 · 24/09/2026 · Plantillas editables
- **Decisión:**
  - Hay 20 plantillas: los textos de §21-C tal cual; el resto, marcados PROVISIONAL hasta que admin los revise (al guardar dejan de serlo).
  - Cada plantilla acepta solo las variables que su evento puede completar.
  - La vista previa usa datos de ejemplo.
  - Una plantilla desactivada no se envía.
  - `/admin/plantillas`: el equipo las ve y solo admin edita.
- **Cómo cambiarla:** `lib/notify/templates.ts`.

### D-058 · 24/09/2026 · SLA vencido
- **Decisión:** se usan horas hábiles de `business_hours` (lunes a viernes, 08:00–17:00, Panamá).
  - Primera respuesta: una solicitud en "Enviada" más de `first_response_sla_hours` (4).
  - Cotización: en revisión o con RFQ enviado más de `quote_sla_hours` (24), contadas desde que quedó en revisión.
  - Un solo aviso por solicitud y etapa.
- **Cómo cambiarla:** `checkSlaOverdue` en `lib/notify/index.ts` y Configuración.

### D-059 · 24/09/2026 · Eventos de cotizaciones y pedidos
- **Duda:** §12 incluye eventos de cotizaciones (E7) y pedidos (E8), que todavía no existen.
- **Decisión:**
  - Sus plantillas y el cálculo de fechas de los recordatorios (vigencia a 3 y 1 día, saldo a los 2 y 5 días, NPS a los 7) quedan listos en E5, en `lib/notify/schedule.ts`, con tests.
  - E7 y E8 los disparan con `enqueueNotification` al crear esas tablas.
  - "Cotización enviada" ya se encola al pasar la solicitud a "Cotizada", pero no sale hasta que E7 aporte el número, la vigencia y el plazo.
- **Cómo cambiarla:** en E7 y E8.

### D-060 · 24/09/2026 · Orden y alcance de la bandeja
- **Decisión:**
  - Por defecto la bandeja muestra las solicitudes abiertas: Enviada, En revisión, Datos pendientes, RFQ enviado y Cotizada.
  - Orden por urgencia:
    1. SLA vencido.
    2. Rojo, amarillo, verde.
    3. La más atrasada respecto de su SLA.
    4. La más antigua.
  - El SLA se cuenta en horas hábiles (D-058).
  - Se calculan hasta 500 solicitudes por filtro, suficiente para el volumen del MVP.
- **Cómo cambiarla:** `listInbox` en `lib/panel/requests.ts`.

### D-061 · 24/09/2026 · Asignación
- **Decisión:** una solicitud se puede tomar ("Tomar" / "Tomarla yo"), asignar a una persona de ventas, operaciones o admin, o pasar al "Siguiente en turno".
  - El turno se reparte entre las personas de ventas activas, empezando por la que lleva más tiempo sin recibir una. Si no hay nadie de ventas, la recibe quien la pide.
  - Cada asignación queda en el historial.
- **Cómo cambiarla:** `assignRequest` en `lib/panel/requests.ts`.

### D-062 · 24/09/2026 · Pedir datos faltantes y respuesta del cliente
- **Decisión:**
  - Se piden datos desde Enviada o En revisión. La lista viene armada con lo que marca el semáforo, en palabras del cliente, y se puede editar.
  - Esa lista es el motivo del paso a "Datos pendientes" y llega tal cual al cliente por correo y WhatsApp.
  - En su enlace, el cliente ve "Nos faltan datos" con la lista y responde ahí (o sube archivos en la sección de arte). La respuesta queda en el historial y avisa al equipo con una plantilla nueva, PROVISIONAL.
  - Con los datos completos, el equipo pasa la solicitud a En revisión.
- **Cómo cambiarla:** `requestMissingData` y `clientReply`.

### D-063 · 24/09/2026 · Motivos de los cambios de estado
- **Decisión:**
  - Cada cambio de estado puede llevar un motivo o nota, que queda en el historial interno.
  - El cliente solo ve el de "Datos pendientes", porque es la lista de lo que falta.
  - Rechazada exige un motivo de pérdida de la lista cerrada de §14, con detalle opcional.
- **Cómo cambiarla:** `changeRequestStatus` en `lib/panel/requests.ts`.

### D-064 · 24/09/2026 · Auditoría
- **Decisión:**
  - `audit_log` registra altas, cambios y bajas de solicitudes, piezas, empresas, arte, perfiles, configuración, plantillas y todas las tablas del catálogo: quién, cuándo y, en los cambios, solo los campos modificados con su valor antes y después.
  - No copia tokens de acceso ni la ficha congelada.
  - No se auditan los borradores (autoguardado), las notificaciones ni las actividades, que ya son un registro.
  - Solo admin la consulta, en `/admin/auditoria` (enlace desde Usuarios).
- **Cómo cambiarla:** `supabase/migrations/006_panel.sql`.

### D-065 · 24/09/2026 · Usuarios del equipo
- **Decisión:**
  - Admin invita por correo con un rol (Administrador, Ventas, Operaciones y QA, Solo lectura): con Supabase, invitación de Supabase Auth; en local, el enlace de acceso simulado.
  - Admin cambia roles y desactiva cuentas. Nadie cambia su propio rol ni se desactiva, y siempre queda un administrador activo (trigger de E1).
- **Cómo cambiarla:** `lib/panel/users.ts`.

### D-066 · 24/09/2026 · Menú completo desde E6
- **Decisión:** el menú ya tiene Bandeja, Pedidos, Catálogo, Plantillas, Reportes, Usuarios y Configuración (más Archivos, solo admin).
  - Pedidos muestra que todavía no hay pedidos; se llena en E8.
  - Reportes muestra el pipeline de solicitudes por estado; E9 suma tiempos, conversión y CSV.
- **Cómo cambiarla:** `config/admin-nav.ts`.

### D-067 · 24/09/2026 · Cálculo del precio
- **Duda:** §11 dice "costo de fábrica + flete estimado + margen", sin aclarar si el margen es sobre el costo o sobre el precio.
- **Decisión:**
  - El margen es sobre el precio de venta (margen bruto): precio unitario = (costo unitario + flete total ÷ cantidad) ÷ (1 − margen).
  - El panel muestra al lado el sobrecosto equivalente. El precio unitario va con 4 decimales y el subtotal con 2.
  - El margen por defecto es `default_margin_pct` (35 %, PROVISIONAL) y se edita por línea.
  - Costos y márgenes nunca llegan al cliente: por permisos de columna, y el portal no los lee.
- **Cómo cambiarla:** `priceLine` en `lib/quotes/pricing.ts`.

### D-068 · 24/09/2026 · Precios solo en el PDF
- **Duda:** CLAUDE.md prohíbe mostrar precios en el portal, y el cliente tiene que aceptar la cotización desde su enlace.
- **Decisión:**
  - El portal muestra la cotización sin precios: número, vigencia, "Descargar cotización (PDF)" y, para aceptar, una cantidad a elegir por pieza (solo cantidades).
  - Los precios están únicamente en el PDF.
  - La aceptación registra fecha, nombre, correo, IP, navegador y cantidades elegidas, y no se puede modificar.
- **Cómo cambiarla:** `components/portal/client-quote.tsx`.

### D-069 · 24/09/2026 · Nombre de la migración de E7
- **Decisión:** TAREAS la llama `006_quotes_rfq`, pero el número 006 ya lo usa el panel de E6. Se llama `007_quotes_rfq`; el orden de los bloques no cambia.
- **Cómo cambiarla:** no aplica.

### D-070 · 24/09/2026 · RFQ a fábrica
- **Decisión:**
  - El formato vive en `config/rfq-format.ts`: una fila por pieza y cantidad, con códigos de catálogo; las cuatro columnas de la fábrica (costo, moneda, días, observaciones) van al final y vacías.
  - Se generan PDF y Excel. El Excel se arma con SheetJS 0.20.3 del CDN oficial, porque la 0.18.5 de npm tiene vulnerabilidades conocidas.
  - Regla de §14: ninguna pieza con impresión sale sin al menos un archivo de arte.
  - Solo viaja el arte liberado, como enlaces firmados de 7 días; no se adjunta, por tamaño.
  - El correo a `FACTORY_EMAIL` lleva adjuntos el PDF y el Excel. Sin esa variable, el panel lo avisa y los documentos se descargan para enviarlos a mano.
- **Cómo cambiarla:** `config/rfq-format.ts` y `lib/rfq/`.

### D-071 · 24/09/2026 · Versiones, vigencia y plazo de la cotización
- **Decisión:**
  - Numeración `C-AAAA-NNNNN-vN`: todas las versiones comparten el número base.
  - Al emitir una versión, la anterior queda "Reemplazada". Si el cliente pide cambios, la cotización queda en "Cambios pedidos" hasta la versión nueva.
  - La vigencia por defecto es `quote_validity_days` (15, PROVISIONAL) y se ajusta en cada cotización.
  - El plazo va por línea según la cantidad (30/45 días de `settings`) y es editable.
- **Cómo cambiarla:** `lib/quotes/index.ts`.

### D-072 · 24/09/2026 · Aviso "Cotización enviada"
- **Decisión:**
  - Se encola al emitir cada versión, con número, vigencia, anticipo, saldo y plazo ("30 a 45" si varía entre cantidades), y no por el paso a Cotizada: así la v2 también avisa y la v1 no avisa dos veces.
  - El PDF no va adjunto: se descarga desde el enlace de seguimiento.
- **Cómo cambiarla:** `issueQuote` y `005`/`007` (trigger de estados).

### D-073 · 24/09/2026 · Vencimiento y cierre de la cotización
- **Decisión:**
  - Cada hora (con el uso del panel o el cron diario), una cotización enviada con la vigencia pasada lleva la solicitud a "Vencida".
  - El cliente recibe recordatorios por WhatsApp a 3 días y a 1 día del vencimiento.
  - Rechazar o vencer la solicitud cierra también su cotización vigente (trigger), y Rechazada exige el motivo de pérdida (D-063).
- **Cómo cambiarla:** `expireQuotes` y `quoteExpiryReminders` en `lib/quotes/index.ts`.

### D-074 · 24/09/2026 · Al aceptar
- **Decisión:** la solicitud pasa a "Aceptada", el equipo recibe el aviso y, en la misma transacción, se llama a `onQuoteAccepted`, el gancho donde E8 crea el pedido.
- **Cómo cambiarla:** `lib/orders/hooks.ts`.

### D-075 · 24/09/2026 · Impuestos en la cotización
- **Duda:** el PRD no dice si los precios incluyen impuestos (ITBMS).
- **Decisión:** la cotización no menciona impuestos: indica la moneda (USD) y las condiciones del PRD. Queda como pregunta para Mark en E10.
- **Cómo cambiarla:** `messages/es.json` > `quotePdf`.

### D-076 · 24/09/2026 · Migración de pedidos: `008_orders`
- **Decisión:** TAREAS la llama `007_orders`, pero el 007 ya es `007_quotes_rfq` (D-069). La migración de pedidos queda como `008_orders`.
- **Cómo cambiarla:** no se renumera; las siguientes siguen desde 009.

### D-077 · 24/09/2026 · Estados e hitos del pedido
- **Decisión:**
  - Estados (§14): Esperando anticipo → Anticipo recibido → En producción → QA en planta → Embarcado → (En aduana) → Entregado → Cerrado. Un trigger impide saltar pasos.
  - Tres hitos son automáticos: "Arte aprobado" (cuando el cliente aprobó el proof de todas las piezas impresas), "Anticipo recibido" y "Saldo recibido" (al confirmar el pago).
  - Los demás los registra el equipo, siempre el siguiente paso válido:
    - Producción exige anticipo y proof aprobado.
    - QA exige cada punto del checklist.
    - Cerrar exige el saldo confirmado.
  - Checklist de QA: seis puntos por pieza (material, calibre, medidas, colores e impresión, acabado y cantidad), con el valor esperado sacado de la ficha congelada. Cada punto queda como Correcto, Observado (con comentario) o No aplica.
  - Si el hito se registra con la fecha de hoy, guarda la hora real; si se registra con una fecha pasada, queda al mediodía de Panamá.
- **Cómo cambiarla:** `MANUAL` y `STATUS_AFTER` en `lib/orders/index.ts`; checklist en `lib/orders/qa.ts`.

### D-078 · 24/09/2026 · Montos del pedido solo en el PDF "Estado de pagos"
- **Conflicto:** TAREAS pide mostrar en `/seguimiento/[token]` los "montos y estado de pagos", pero CLAUDE.md prohíbe mostrar precios en el portal. Prevalece CLAUDE.md.
- **Decisión:**
  - El portal muestra el estado de cada pago (Pendiente, Comprobante en revisión, Confirmado, Rechazado) y los porcentajes de la condición 50/50, sin montos.
  - Los montos (total, anticipo, saldo, lo pagado y lo pendiente) van en el PDF "Estado de pagos", que el cliente descarga con su enlace; el equipo lo emite desde el panel.
  - La base refuerza la regla: el rol anónimo no tiene permiso sobre las columnas de montos de `orders` ni de `payments`.
- **Cómo cambiarla:** `lib/orders/statement-pdf.tsx` y `components/portal/client-order.tsx`.

### D-079 · 24/09/2026 · Registro de pagos y comprobantes
- **Decisión:**
  - Pago que registra el equipo: queda confirmado de una vez.
  - Comprobante que sube el cliente (PDF o foto): crea un pago "por confirmar", de anticipo si el anticipo aún no está confirmado y de saldo en otro caso, y avisa al equipo por correo. El equipo lo confirma con el monto recibido o lo rechaza.
  - Hasta 5 comprobantes sin revisar por pedido (cada uno avisa al equipo). Un pedido cerrado ya no recibe comprobantes.
  - Se aceptan pagos parciales; el formulario propone lo que falta.
  - Datos de pago que ve el cliente: setting público `payment_instructions`, vacío y PROVISIONAL, para no inventar cuentas. Mientras esté vacío, el portal ofrece pedirlos por WhatsApp.
- **Cómo cambiarla:** `recordPayment`, `reviewPayment` y `confirmReceiptUpload` en `lib/orders/index.ts`; el texto en `/admin/configuracion`.

### D-080 · 24/09/2026 · Fecha estimada de entrega y alerta de atraso
- **Decisión:**
  - Plazo del pedido: el mayor de las líneas elegidas al aceptar.
  - Inicio del plazo (§14): lo último entre el anticipo confirmado y el último proof aprobado; sin impresión, el anticipo. Hasta entonces la fecha dice "por confirmar".
  - La ETA que carga el equipo al embarcar reemplaza a la fecha estimada en pantalla y en los avisos.
  - Alerta de atraso: un pedido abierto cuya ETA, o fecha estimada si no hay ETA, ya pasó. Se marca en la lista y en el detalle del pedido.
- **Cómo cambiarla:** `recomputeSchedule` e `isDelayed` en `lib/orders/index.ts`.

### D-081 · 24/09/2026 · Evidencias de los hitos
- **Decisión:**
  - Bucket privado `evidence` que acepta JPG, PNG, WebP, MP4, MOV y PDF.
  - Tamaño máximo por archivo según `upload_max_mb`; hasta 30 archivos por hito.
  - Se verifica el tipo real del archivo; si el contenido no corresponde a un formato aceptado, se borra.
  - El cliente ve las evidencias en su enlace apenas se suben, sin aprobación previa, con URL firmada de 10 minutos.
  - El acta de entrega de §12 se sube como evidencia del hito "Entregado" (foto o PDF de la guía firmada).
- **Cómo cambiarla:** `EVIDENCE_EXT`, `EVIDENCE_KINDS` y `MAX_EVIDENCE` en `lib/orders/index.ts`.

### D-082 · 24/09/2026 · Avisos de los hitos
- **Decisión:**
  - El PRD redacta solo el texto del hito de QA. Para "Producción iniciada" y "Embarcado" se agregan plantillas de WhatsApp PROVISIONAL (`order_production` y `order_shipped`). "Entregado" usa la de §21-C.
  - El texto de QA anuncia el "Embarque estimado": el formulario de QA tiene esa fecha (opcional). Si queda vacía, el aviso dice "por confirmar".
  - Como el pedido ahora se crea solo al aceptar, el aviso "Cotización aceptada (equipo)" cambia a "El pedido ya está creado: solicita el anticipo". Solo se cambia si nadie editó el texto.
- **Cómo cambiarla:** `/admin/plantillas`.

### D-083 · 24/09/2026 · "Pedir de nuevo"
- **Decisión:**
  - El botón abre `/cotizar?repetir=<token>` en el resumen, con las mismas piezas y la cantidad que se pidió.
  - Solo se copian las opciones que siguen activas en el catálogo; las que ya no están se vuelven a elegir.
  - Los archivos no se copian. El comentario pide usar el arte aprobado del pedido anterior.
  - El contacto viene prellenado, pero el consentimiento se vuelve a marcar.
  - Como la URL lleva el token, no se carga la analítica y el wizard quita el parámetro de la barra.
  - Al editar, reemplaza el borrador que hubiera en curso en ese dispositivo.
- **Cómo cambiarla:** `lib/orders/reorder.ts` y `app/cotizar/page.tsx`.

### D-084 · 24/09/2026 · Encuesta NPS y recordatorios de saldo
- **Decisión:**
  - Encuesta: formulario de 0 a 10 con comentario, en el enlace del cliente (`#encuesta`), una por pedido. Se abre al entregar y queda con la IP.
  - El correo de la encuesta sale desde el día 7 después del cierre, una sola vez.
  - Recordatorio de saldo por WhatsApp a los 2 y 5 días de la entrega, mientras el saldo no esté confirmado, una vez por día.
  - Ambos corren en `lib/jobs.ts`, a lo sumo cada hora, con el uso del panel o con el cron diario.
- **Cómo cambiarla:** `balanceReminders` y `npsSurveys` en `lib/orders/index.ts`; días en `lib/notify/schedule.ts`.
