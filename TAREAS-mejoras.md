# TAREAS-mejoras.md · Cola de mejoras antes del lanzamiento

**Mark decide.** Esta cola no se ejecuta hasta que Mark la active. Puede quitar, reordenar o agregar bloques.

- **De dónde sale cada bloque:** cada uno es una propuesta de `docs/MEJORAS.md` (P-xx), con la evidencia de `docs/AUDITORIA.md`.
- **Orden:** el de `docs/MEJORAS.md`, es decir, impacto dividido entre esfuerzo.
- **Dependencias:** están anotadas en cada bloque.

Cómo arrancar, cuando Mark lo decida. Abre Claude Code en la carpeta del proyecto y pega:

> Lee `CLAUDE.md`, `docs/AUDITORIA.md` y `docs/MEJORAS.md`. Ejecuta los bloques de `TAREAS-mejoras.md` que están entre COLA:INICIO y COLA:FIN, en orden, sin detenerte a preguntar. Registra cualquier decisión en `docs/DECISIONES.md`. Usa el nivel de esfuerzo de cada bloque. Al cerrar cada bloque, actualiza `docs/AVANCE.md`, marca las casillas aquí y haz commit y push.

## Reglas para toda la cola

- **CLAUDE.md manda.** En especial:
  - ningún precio automático ni estimado al cliente (regla 7);
  - no se paga ni se crea ningún servicio (regla 5);
  - todo valor de negocio que no esté en el PRD entra como `is_provisional = true` o como setting PROVISIONAL, y lleva etiqueta solo en el panel (regla 6);
  - el nombre del dueño va sin título (regla 8).
- **Commits:** uno por sub-tarea, con el mensaje `M3: estados manuales limitados`.
- **Cierre de cada bloque:** `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:e2e` en verde, CI en verde y `pnpm verify:deploy` en verde.
- **Migraciones:** toda migración es nueva (`011_…` en adelante). Nunca se edita una migración ya aplicada.
- **Textos:** todo texto nuevo va en `messages/es.json`, y todo log pasa por `lib/log.ts`.
- **Preguntas de Mark:** si un bloque depende de una respuesta pendiente de `docs/PREGUNTAS.md`, se usa la opción conservadora que indica `docs/MEJORAS.md` ("Qué depende de Mark") y se deja cambiable desde Configuración.

<!-- COLA:INICIO -->

## M1 — Transacciones sin anidar y pantallas de error · esfuerzo: medium · P-01

Objetivo: que el portal del pedido y la primera cotización funcionen con `DB_POOL_MAX=1`, y que ningún error deje una pantalla en blanco (DAT-01, REN-01, COD-01, DAT-05, COD-02).

- [ ] `getClientOrder` (`lib/orders/index.ts`): validar el token y leer el pedido, los montos y los pagos sin abrir una transacción dentro de otra. Puede ser una sola transacción de servicio después de validar el token. Quitar la doble lectura de pagos.
- [ ] `createQuoteDraft` (`lib/quotes/index.ts`):
  - numerar en la misma transacción, con una función `security definer` con permiso para el equipo;
  - bloquear la solicitud con `select … for update` antes de buscar el borrador;
  - migración con un índice único parcial en `quotes(request_id) where status = 'draft'`.
- [ ] `lib/db/actor.ts`: `withActor` detecta el anidamiento con AsyncLocalStorage. Fuera de producción lanza un error; en producción, `log.error`.
- [ ] Prueba de base con `DB_POOL_MAX=1` que abre el portal de un pedido y prepara la primera cotización. Agregar a CI un paso con `DB_POOL_MAX=1`, y hacer que `verify:deploy` corra con 1.
- [ ] Fronteras de error con textos en `messages/es.json` y botón Reintentar:
  - `app/global-error.tsx`;
  - `app/error.tsx`;
  - `app/cotizar/error.tsx`, que avisa que el borrador está guardado;
  - `app/seguimiento/[token]/error.tsx`;
  - `app/admin/(panel)/error.tsx`.
- [ ] `docs/deploy.md`: quitar el aviso bloqueante de DAT-01 y dejar `DB_POOL_MAX=1` como valor recomendado.

Aceptación:
- Con `DB_POOL_MAX=1`, la prueba del portal y la de "Preparar cotización" terminan sin timeout.
- Dos "Preparar" simultáneos crean un solo borrador v1.
- Un error forzado en cada zona muestra su página de error con la marca.
- Todo en verde.

## M2 — Montos y moneda sin ambigüedad · esfuerzo: medium · P-02

Objetivo: que ningún monto del panel se guarde distinto de lo que se escribió, y que un costo en otra moneda no pase como dólares (REG-01, REG-11, PAN-13, FUT-12).

- [ ] `parseMoney` (`lib/quotes/pricing.ts`): un solo formato, el de la pantalla.
  - Punto decimal, y coma solo como separador de miles en grupos de 3.
  - Lo demás con coma ("5,5", "5.000,50") se rechaza con el mensaje "Usa punto para los decimales".
- [ ] Junto a cada campo de dinero del panel (costos, flete, precio, pagos), mostrar el valor interpretado ("= USD 5,000.00") antes de guardar.
- [ ] Respuesta de fábrica:
  - la moneda sale de una lista cerrada (USD y PEN);
  - si no es `settings.currency`, "Preparar cotización" pide el tipo de cambio y su fecha;
  - por línea se guardan `cost_currency`, `fx_rate` y el costo original (migración nueva);
  - el editor muestra la moneda junto a cada costo.
- [ ] Pruebas unitarias:
  - "5,000" → 5000;
  - "1,923.00" → 1923;
  - "5,5" → error;
  - "5.000,50" → error;
  - "1,20" → error.
- [ ] Pruebas de base: una respuesta en PEN sin tipo de cambio no deja preparar la cotización; con tipo de cambio, guarda el costo original y el convertido.

Aceptación:
- En e2e, escribir "5,000" en un costo muestra "= USD 5,000.00" y la línea queda en 5000.
- Ninguna ruta del panel acepta un monto ambiguo.
- Todo en verde.

## M3 — Estados manuales limitados · esfuerzo: medium · P-03

Objetivo: que "RFQ enviado", "Cotizada" y "Aceptada" solo ocurran a través de las acciones del sistema (REG-03, PAN-01, PAN-05, PAN-16, COD-10).

- [ ] `lib/states.ts`: lista `MANUAL_TRANSITIONS` (`in_review` y `data_pending`, y `rejected` con motivo donde la máquina lo permita). El selector del panel usa solo esa lista.
- [ ] Migración: el trigger `request_transition_allowed` solo acepta `rfq_sent`, `quoted` y `accepted` si los fija una función del sistema:
  - la variable de sesión la fijan `generateRfq`/`sendRfq`, "Marcar RFQ enviado a mano", `issueQuote` y `acceptQuote`;
  - `authenticated` no puede fijarla directamente.
- [ ] Botón "Marcar RFQ enviado a mano", con destinatario y fecha: registra `sent_at`, pasa la solicitud a RFQ enviado y deja la actividad en el historial.
- [ ] Prueba de paridad que recorre todos los pares de estados de la solicitud y del pedido y compara TypeScript con SQL.

Aceptación:
- Desde el panel no se llega a Cotizada ni a Aceptada sin cotización.
- Un `update` directo con rol `authenticated` a esos estados falla.
- La prueba de paridad pasa.
- El e2e del ciclo completo sigue en verde.
- Todo en verde.

## M4 — Registrar la aceptación del cliente desde el panel · esfuerzo: medium · P-04

Objetivo: el registro manual de la aceptación por WhatsApp que pide el PRD §11 (PAN-01).

- [ ] En la cotización emitida, el botón "Registrar aceptación del cliente". Pide:
  - la cantidad elegida por pieza;
  - el nombre de quien acepta;
  - el canal (WhatsApp, correo o llamada);
  - la fecha;
  - una captura opcional.
- [ ] Reutiliza `acceptQuote` con actor del equipo: crea el pedido y deja historial y auditoría con el canal. Rige la misma vigencia que para el cliente.
- [ ] Textos en `messages/es.json`, y una sección en `docs/manual-equipo.md`.

Aceptación:
- En e2e, el vendedor registra una aceptación por WhatsApp y aparece el pedido P- con el anticipo correcto.
- Prueba de base: un usuario de solo lectura no puede registrarla, y una cotización vencida tampoco se puede aceptar así.
- Todo en verde.

## M5 — Proof aprobado antes de producir · esfuerzo: medium · P-05

Objetivo: que ninguna pieza impresa entre a producción sin su último proof aprobado (REG-04, REG-10).

- [ ] La regla de producción evalúa, pieza por pieza, la última versión del proof: tiene que estar aprobada y liberada. Una v2 pendiente bloquea aunque la v1 esté aprobada.
- [ ] Pieza "No sé, sugiéranme": exige un proof aprobado o la marca "sin impresión" del equipo. La marca es una casilla auditada en el pedido, hasta que M13 permita definirlo en la ficha.
- [ ] La misma regla vive en la base (función o trigger del inicio de producción) y en `lib/orders`.

Aceptación:
- Pruebas de base:
  - v1 aprobado y v2 pendiente → producción rechazada;
  - pieza "No sé" sin proof ni marca → rechazada;
  - con la marca "sin impresión" → permitida.
- El e2e de pedidos sigue en verde.
- Todo en verde.

## M6 — SLA y avisos cada 15 minutos · esfuerzo: medium · P-06

Objetivo: que las alertas de SLA y los avisos salgan sin que nadie abra el panel, sin contratar nada (REN-03, REN-02).

- [ ] `scripts/cron-install.mjs` (`pnpm cron:install`):
  - registra en Supabase Cron (pg_cron y pg_net, incluidos en el plan gratuito) una llamada a `/api/cron/notifications` cada 15 minutos;
  - la URL y `CRON_SECRET` se leen del entorno y se guardan en Vault;
  - no escribe secretos en el repositorio;
  - `--quitar` lo desinstala.
- [ ] `/api/cron/notifications` también corre la revisión de SLA.
- [ ] Reintentos:
  - espera creciente en `next_attempt_at` (5 min, 30 min y 2 h);
  - un 429 no cuenta como intento;
  - aviso al equipo cuando hay fallidos;
  - botón "Reenviar" en el panel.
- [ ] `docs/deploy.md`: cómo instalarlo y apagarlo, y la alternativa con cron de Vercel Pro. Actualizar D-013 en `docs/DECISIONES.md`.

Aceptación:
- Prueba: un envío que recibe 429 se reprograma sin gastar intento.
- Prueba: llamar a la ruta con `CRON_SECRET` marca el SLA vencido sin abrir el panel.
- `verify:deploy` informa si el job no está instalado cuando la base es Supabase.
- Todo en verde.

## M7 — Datos de los KPI desde el primer día · esfuerzo: medium · P-07

Objetivo: guardar lo que no se puede reconstruir después para medir el abandono, el esfuerzo y la información completa (PAN-14, REG-12, DAT-16).

- [ ] Migración `quote_drafts`: `max_step` y `first_step_at`, que el guardado actualiza.
- [ ] `purge-drafts`: antes de borrar un borrador, guarda una fila en `wizard_funnel`. Sin datos personales: inicio, paso máximo, segmento y si se envió.
- [ ] Migración `quote_requests`: `initial_traffic_light`, `initial_missing_fields` y `completion_minutes`, congelados al enviar.
- [ ] Los reportes y la revisión de SLA excluyen `is_demo`.
- [ ] En `docs/DECISIONES.md`, las definiciones:
  - "Completa a la primera": sin campos rojos al enviar; el verde se informa aparte.
  - "Abandono": borrador con el paso 1 completo que no se envía en 30 días.

Aceptación:
- Prueba de base: una solicitud enviada guarda su semáforo inicial y sus minutos.
- Prueba de base: purgar un borrador deja su fila de embudo sin nombre, correo ni WhatsApp.
- Los reportes existentes no cuentan las solicitudes DEMO.
- Todo en verde.

## M8 — El cotizador no pierde el avance · esfuerzo: medium · P-08

Objetivo: que el gesto Atrás, una falla de red o un borrador viejo no hagan perder la solicitud (UX-02, UX-11, UX-06, UX-16, COD-09).

- [ ] Cada cambio de paso hace `history.pushState`, solo con el número de paso y nunca con el token, y `popstate` vuelve al paso anterior.
- [ ] Recuperación: si falla la red al abrir, se conservan el estado y el token locales. `localStorage` no se escribe hasta terminar la recuperación.
- [ ] Aviso "Retomamos tu solicitud del {fecha}" con "Empezar una nueva". La copia local vence a los 30 días.
- [ ] El borrador local se valida y se migra con el esquema compartido, sin `server-only`. Lo incompatible se descarta con un aviso.

Aceptación:
- E2E móvil: `page.goBack()` en el paso 4 vuelve al 3 con los datos.
- E2E: con la recuperación abortada por `page.route`, el borrador y el token siguen.
- E2E: "Empezar una nueva" deja el cotizador vacío.
- Unitaria: un estado de la versión anterior se migra o se descarta.
- Todo en verde.

## M9 — Arte completo a la primera · esfuerzo: medium · P-09

Objetivo: eliminar la causa de rojo que depende del cliente (`lib/traffic-light.ts:41-45`, UX-03, UX-04).

- [ ] Con "Tengo el arte", Continuar exige al menos un archivo, o elegir "Lo envío después". Esa opción deja el arte pendiente, en amarillo.
- [ ] PNG y JPG se aceptan como referencia, con el aviso "te pediremos el vectorial". El error de tipo dice qué formatos se aceptan.
- [ ] Continuar y Enviar esperan a que terminen las subidas en curso, con el progreso a la vista. El resumen muestra el estado de cada archivo.

Aceptación:
- E2E: "Tengo el arte" sin archivo no avanza.
- E2E: con un PNG, la solicitud no queda roja por falta de arte.
- E2E: una subida lenta (con `page.route` y demora) no se pierde al enviar.
- Las reglas del semáforo no cambian (unitarias).
- Todo en verde.

## M10 — WhatsApp local y contacto en orden · esfuerzo: medium · P-10

Objetivo: menos fricción en el paso de contacto, que concentra 46 de las 66 teclas del camino mínimo (UX-05, UX-12).

- [ ] `normalizeWhatsapp` (`lib/quote/validate.ts`): acepta 8 dígitos que empiezan por 6 y los guarda como +507. Se siguen aceptando "+" y "00".
- [ ] Paso 8, en este orden: nombre, WhatsApp, correo, ciudad, dirección y, al final, los opcionales.
- [ ] `enterKeyHint` en cada campo; Enter lleva al siguiente.

Aceptación:
- Unitarias:
  - "6123-4567" → "+50761234567";
  - "+507 6123 4567" → lo mismo;
  - "1234-5678" → error.
- El e2e móvil del cotizador pasa con un número local.
- axe no marca problemas nuevos.
- Todo en verde.

## M11 — Guía de despliegue con los planes correctos · esfuerzo: medium · P-11

Objetivo: que la guía no lleve a planes que fallan en semanas o que no permiten uso comercial (REN-11, REN-12, REN-07). No se contrata nada.

- [ ] `docs/deploy.md` y `docs/lanzamiento.md`:
  - la configuración recomendada: Supabase Pro + Vercel Pro;
  - el costo estimado de la auditoría §8, con la advertencia de verificar los precios;
  - la decisión pendiente de Mark (pregunta 20 de `docs/PREGUNTAS.md`).
- [ ] El paso para subir el límite de tamaño de archivos en Supabase, según `settings.max_file_mb`.
- [ ] Previews de Vercel con un segundo proyecto Supabase Free: sin `RESEND_API_KEY` y con un `FACTORY_EMAIL` de prueba.
- [ ] `verify:deploy` compara el límite de tamaño de cada bucket con `max_file_mb` y avisa si no alcanza.

Aceptación:
- Ningún paso de la guía deja producción en un plan de uso no comercial.
- La comprobación de buckets tiene prueba unitaria.
- `verify:deploy` en verde en local.
- Todo en verde.

## M12 — Pagos conciliados por monto · esfuerzo: high · P-20

Objetivo: que el anticipo y el saldo se den por pagados solo cuando los pagos confirmados cubren el monto (DAT-02, REG-02, PAN-02, FUT-01, REG-13, REG-06, COD-03). Depende de M5 (regla de producción).

- [ ] Estado por suma:
  - el anticipo está cubierto cuando lo confirmado es ≥ `deposit_amount` − `payment_tolerance`;
  - `payment_tolerance` es un setting PROVISIONAL, con 0 por defecto (pregunta 19 de `docs/PREGUNTAS.md`);
  - el saldo y el cierre siguen la misma regla.
- [ ] Estado "parcial" visible en el panel y en el portal, con Cotizado, Pagado y Pendiente por tipo.
- [ ] Al confirmar un comprobante, se elige el tipo (anticipo o saldo).
- [ ] Anular un pago (`voided`), con motivo y auditado.
- [ ] Índice único `(order_id, kind, reference)` cuando `reference` no es nulo.
- [ ] Montos en centavos enteros:
  - el anticipo se redondea hacia arriba al centavo;
  - el saldo es total − anticipo;
  - la regla de redondeo se registra en `docs/DECISIONES.md`.
- [ ] En la base:
  - producción exige el anticipo cubierto;
  - cerrar exige el saldo cubierto;
  - los montos del pedido no se editan (un cambio pasa por una cotización nueva);
  - los pagos confirmados solo se insertan por una función `security definer`.
- [ ] El hito y el aviso de "anticipo recibido" salen al completar el monto. Los recordatorios de saldo se cortan solo cuando el saldo está cubierto.
- [ ] Al tocar `lib/orders/index.ts`, separar `payments.ts` y `milestones.ts` (COD-05).

Aceptación (pruebas de base):
- Un abono de 100 sobre un anticipo de 5.000 deja el pedido esperando el anticipo, en estado parcial y sin plazo.
- El abono que completa el monto pasa el pedido a "anticipo recibido" y arranca el plazo.
- Cerrar con saldo pendiente se rechaza.
- Un pago con referencia repetida se rechaza.
- Anular un pago recalcula el estado.
- Con un total de 1.000,01 y 50 %, el anticipo es 500,01 y el saldo 500,00.

Además, el e2e de pedidos muestra los montos correctos en el portal. Todo en verde.

## M13 — Editar la ficha, las cantidades y el contacto · esfuerzo: high · P-21

Objetivo: que el vendedor complete y corrija la solicitud dentro del sistema (PAN-03, REG-04, REG-12). Depende de M7 (semáforo inicial congelado).

- [ ] "Editar pieza", para ventas y admin, antes del RFQ o de la cotización. Usa el mismo catálogo, las compatibilidades (`lib/compat.ts`) y la validación del cotizador (`lib/quote/validate.ts`).
- [ ] Cada edición crea una versión nueva de `spec_snapshot`, con autor, fecha y motivo (historial visible), y recalcula el semáforo actual.
- [ ] Agregar o quitar cantidades por pieza.
- [ ] Editar el contacto (nombre, empresa, WhatsApp, correo, ciudad y dirección), con auditoría.
- [ ] Aviso si ya hay un RFQ o una cotización emitida sobre la versión anterior, con la opción de generar un RFQ nuevo.
- [ ] El semáforo también se recalcula al subir o borrar arte y al volver a En revisión.
- [ ] En el pedido, la marca "sin impresión" de M5 pasa a definirse en la ficha.

Aceptación:
- E2E: una solicitud "No sé, sugiéranme" se completa en el panel y genera un RFQ con tipo, tamaño y material definidos.
- Pruebas de base:
  - la edición conserva la versión anterior y deja auditoría;
  - rojo → subir arte → amarillo o verde;
  - un usuario de solo lectura no puede editar.
- Todo en verde.

## M14 — Cola de WhatsApp y avisos por los dos canales · esfuerzo: high · P-22

Objetivo: que ningún aviso al cliente dependa de que alguien abra la solicitud correcta (PAN-04, FUT-02, PAN-15). Depende de M6 (cron).

- [ ] `/admin/whatsapp`:
  - los avisos pendientes de todas las solicitudes y pedidos, con su antigüedad;
  - filtro por responsable;
  - "Abrir y marcar enviado" en un toque;
  - contador en el menú del panel.
- [ ] Resumen diario por correo al equipo con los WhatsApp pendientes de más de `whatsapp_pending_alert_hours` horas hábiles (setting PROVISIONAL, 2).
- [ ] Migración con plantillas:
  - de correo, para los 5 avisos que hoy solo existen por WhatsApp;
  - de WhatsApp, para "anticipo recibido";
  - con textos PROVISIONAL.
- [ ] En el detalle: "Copiar enlace de seguimiento" y "Reenviar enlace por WhatsApp", con registro en el historial. Corregir `docs/manual-equipo.md`.

Aceptación:
- E2E: un recordatorio automático aparece en la cola y se marca enviado desde ahí.
- Prueba de base: cada evento de aviso al cliente tiene plantilla en los dos canales.
- Sin `RESEND_API_KEY`, el resumen diario queda como `simulated`.
- Todo en verde.

## M15 — Abuso anónimo y cuenta de administrador · esfuerzo: high · P-23

Objetivo: que el cotizador público no se pueda usar para llenar la base, el Storage o el correo, y que nadie tome la cuenta de administrador (SEG-01, REN-08, SEG-04, SEG-05, SEG-06, SEG-09).

- [ ] Límites en el cotizador (settings PROVISIONAL):
  - un tope propio para crear borradores por IP y hora;
  - un tamaño máximo más bajo para el contenido de cada borrador;
  - las URLs firmadas pendientes se cuentan por borrador y por pieza.
- [ ] Cada subida se registra al firmarla, y `purge-drafts` borra las no confirmadas a las 24 horas.
- [ ] Turnstile obligatorio en producción:
  - `verify:deploy` falla si faltan las claves;
  - se exige captcha también en "Guardar y seguir después", que solo manda el enlace al correo guardado en el borrador.
- [ ] El arranque falla si `ALLOW_LOCAL_AUTH_LINKS` o `RATE_LIMIT_FACTOR` están definidas con `VERCEL_ENV=production`.
- [ ] Cuenta de administrador:
  - script `pnpm admin:invite`, con `auth.admin.inviteUserByEmail`;
  - `signInWithOtp` con `shouldCreateUser: false`;
  - `handle_new_user` asigna el rol de admin solo si el correo está confirmado;
  - `docs/deploy.md`: desactivar "Allow new users to sign up".
- [ ] `payment_instructions` deja de ser público (migración). El portal la sigue leyendo después de validar el token.

Aceptación:
- Prueba de base: superado el tope configurado, la misma IP no puede crear más borradores en esa hora.
- Prueba de base: una subida sin confirmar se borra en la purga.
- Unitaria: el arranque con `ALLOW_LOCAL_AUTH_LINKS` en producción falla.
- Prueba de base: un usuario con el correo de admin sin confirmar no recibe el rol.
- `tests/db/security.test.ts` extendido.
- Todo en verde.

## M16 — Respaldos y migraciones al nivel del PRD · esfuerzo: high · P-30

Objetivo: respaldos diarios de la base y de los archivos con 30 días de retención (PRD §15), restauración probada y migraciones inmutables (DAT-04, REN-10, DAT-11, DAT-12).

- [ ] Base:
  - retención de 30 días en el workflow de respaldo;
  - respaldo de `auth.users` (id y correo) para restaurar con los mismos UUID.
- [ ] Archivos: copia diaria de los buckets privados a un destino compatible con S3, configurado por variables de entorno.
  - Sin credenciales, el job avisa y no falla.
  - No se contrata ningún almacenamiento.
  - Las variables se documentan en `.env.example`.
- [ ] Restauración:
  - ensayo automático en CI: restaurar el último respaldo en un Postgres vacío y correr `verify:deploy` contra él;
  - el procedimiento, en `docs/respaldos.md`.
- [ ] Migraciones:
  - se guarda el sha256 de cada migración aplicada en `schema_migrations`;
  - `db:migrate` y CI fallan si un archivo aplicado cambió;
  - `pg_dump` previo obligatorio cuando la base es Supabase.

Aceptación:
- CI restaura un respaldo y pasa `verify:deploy`.
- Editar una migración aplicada hace fallar `db:migrate` con un mensaje claro.
- Todo en verde.

## M17 — Ley 81: acceso y eliminación de datos personales · esfuerzo: high · P-31

Objetivo: atender desde el panel el derecho de acceso y eliminación, como pide el PRD §15 (DAT-03, SEG-07, PAN-12, SEG-02). Depende de M14 (plantillas nuevas en `notifications`).

- [ ] Solo admin: buscar por correo o WhatsApp y exportar en JSON y PDF todo lo del titular (solicitudes, pedidos, pagos, avisos y archivos).
- [ ] `anonymize_request(request_id)`, `security definer` y solo para admin.
  - Reemplaza nombre, correo, WhatsApp, dirección e IP en:
    - `quote_requests`;
    - `companies`, si no tiene otras solicitudes;
    - `quote_drafts.payload`;
    - `notifications` (destinatario, cuerpo y enlace);
    - `activities`;
    - `before` y `after` de `audit_log`, con una excepción controlada al trigger de inmutabilidad.
  - Borra los archivos del titular.
  - Conserva los montos y los números de documento.
  - Deja constancia en `audit_log`.
  - El panel pide doble confirmación.
- [ ] `lib/log.ts` limpia todo lo que se registra: ni tokens, ni correos, ni teléfonos. Prueba unitaria que falla si un log contiene alguno de ellos.
- [ ] La política de privacidad explica cómo pedir el acceso y la eliminación. El texto es PROVISIONAL hasta la revisión legal (preguntas 11 y 22 de `docs/PREGUNTAS.md`).

Aceptación:
- Prueba de base: tras anonimizar, ninguna columna de texto del esquema `public` contiene el correo ni el WhatsApp del titular, y los montos del pedido siguen.
- La exportación incluye todas las tablas con datos del titular.
- Un usuario de ventas no puede anonimizar.
- Todo en verde.

<!-- COLA:FIN -->

## Fuera de la cola

- **Primer mes:** P-12 a P-19, P-24 a P-29, P-32 a P-34 y P-36.
- **Fase 2:** P-35 y P-37.

Están descritas en `docs/MEJORAS.md` y se agregan a esta cola solo si Mark lo pide.
