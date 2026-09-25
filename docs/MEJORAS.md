# Propuestas de mejora · ProvenPack

Propuestas que salen de `docs/AUDITORIA.md` (25/09/2026). Cada una dice:
- qué problema resuelve;
- con qué evidencia (IDs de la auditoría y archivos);
- qué se cambia;
- a qué KPI de PRD §3 apunta;
- cuánto cuesta, qué riesgo tiene y en qué fase conviene hacerla.

Las propuestas de "antes del lanzamiento" forman la cola ejecutable de `TAREAS-mejoras.md`. **Nada de esto se ejecuta hasta que Mark lo decida.**

## Cómo se ordenan

- **Impacto (1 a 5):**
  - **5:** sin el cambio se pierde dinero o datos, o el flujo se bloquea con datos reales.
  - **4:** mueve de forma directa un KPI de §3, o evita un error que va a ocurrir en la operación normal.
  - **3:** mejora clara de un KPI, o reduce un riesgo legal u operativo.
  - **2:** mejora acotada.
  - **1:** menor.
- **Esfuerzo:** la misma escala de `TAREAS.md`. Para ordenar, medium pesa 1, high pesa 2 y ultracode pesa 4. Ninguna propuesta necesita ultracode.
- **Prioridad** = impacto ÷ peso del esfuerzo. La lista va de mayor a menor. Si hay empate, primero va lo que es "antes del lanzamiento" y luego lo de mayor impacto.
- **Riesgo:** la probabilidad de romper algo que hoy funciona o de causar un efecto no deseado.
- **Fases:**
  - **Antes del lanzamiento:** defectos, riesgos de dinero, datos o ley, y datos que hay que guardar desde el primer día.
  - **Primer mes:** mejoras que conviene decidir con los primeros datos reales.
  - **Fase 2:** va junto a los bloques F2 de `TAREAS.md`.

El impacto es un juicio basado en la evidencia de la auditoría, no una medición. **Ninguna propuesta afirma cuánto va a mover un KPI:** el PRD calibra las metas con los primeros 60 días de datos, y la propuesta P-07 es la que permite medirlas.

**Reglas que se respetan en todas:**
- Ningún precio automático ni estimado para el cliente.
- No se contrata ningún servicio.
- Todo valor de negocio que no esté en el PRD entra como PROVISIONAL.
- El nombre del dueño va sin título.

## Resumen

| # | Propuesta | KPI principal | Impacto | Esfuerzo | Prioridad | Riesgo | Fase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | Que nada se cuelgue ni se caiga en blanco | Cotizar más rápido, Cierre | 5 | medium | 5,0 | bajo | antes del lanzamiento |
| P-02 | Montos y moneda sin ambigüedad en el panel | Cierre | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-03 | Estados manuales solo donde tienen sentido | Cierre, Cero retipeo | 4 | medium | 4,0 | medio | antes del lanzamiento |
| P-04 | Registrar la aceptación que llega por WhatsApp o llamada | Cierre | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-05 | Nada entra a producción sin proof aprobado | Arte utilizable, Cumplimiento | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-06 | Alertas de SLA y avisos cada 15 minutos, sin pagar | Cotizar más rápido | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-07 | Guardar desde el primer día los datos de los KPI | Abandono, Esfuerzo, Información completa | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-08 | El cotizador no pierde el avance | Abandono | 4 | medium | 4,0 | medio | antes del lanzamiento |
| P-09 | Arte completo a la primera | Información completa | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-10 | WhatsApp local y contacto en el orden natural | Abandono, Esfuerzo | 4 | medium | 4,0 | bajo | antes del lanzamiento |
| P-11 | Guía de despliegue con los planes correctos | Todos (disponibilidad) | 3 | medium | 3,0 | bajo | antes del lanzamiento |
| P-12 | Recordatorio del RFQ sin respuesta y tiempo de la fábrica medido | Cotizar más rápido | 3 | medium | 3,0 | bajo | primer mes |
| P-13 | Emitir con vista previa y respuesta de la fábrica flexible | Cierre, Cumplimiento | 3 | medium | 3,0 | bajo | primer mes |
| P-14 | Revisión de arte e hitos con menos clics | Cotizar más rápido, Arte utilizable | 3 | medium | 3,0 | bajo | primer mes |
| P-15 | Orden de producción automática al liberar | Cero retipeo, Cumplimiento | 3 | medium | 3,0 | medio | primer mes |
| P-16 | "No sé" donde falta y "Sugiéranme" arriba | Abandono, Información completa | 3 | medium | 3,0 | medio | primer mes |
| P-17 | Completitud guiada en el resumen | Información completa | 3 | medium | 3,0 | medio | primer mes |
| P-18 | Recordatorio a quien pidió "guardar y seguir después" | Abandono | 3 | medium | 3,0 | bajo | primer mes |
| P-19 | Consentimiento de WhatsApp e idioma por solicitud | (prepara la fase 2) | 3 | medium | 3,0 | bajo | primer mes |
| P-20 | Pagos conciliados por monto | Cumplimiento, Recompra | 5 | high | 2,5 | medio | antes del lanzamiento |
| P-21 | Editar la ficha, las cantidades y el contacto desde el panel | Cero retipeo, Cotizar más rápido | 5 | high | 2,5 | medio | antes del lanzamiento |
| P-22 | Cola de WhatsApp y avisos por los dos canales | Cotizar más rápido, Cierre, Satisfacción | 4 | high | 2,0 | bajo | antes del lanzamiento |
| P-23 | Cerrar el abuso anónimo y proteger la cuenta de administrador | Conversión (disponibilidad) | 4 | high | 2,0 | medio | antes del lanzamiento |
| P-24 | Bandeja "Requiere acción" y pendientes por persona | Cotizar más rápido | 4 | high | 2,0 | bajo | primer mes |
| P-25 | Respuesta de la fábrica por enlace seguro | Cotizar más rápido, Cero retipeo | 4 | high | 2,0 | medio | primer mes |
| P-26 | Feriados en plazos y SLA | Cumplimiento | 2 | medium | 2,0 | bajo | primer mes |
| P-27 | Textos claros, resumen corto y teclado | Esfuerzo, Abandono | 2 | medium | 2,0 | bajo | primer mes |
| P-28 | Enlace de seguimiento: regenerar, copiar y guardar solo el hash | (seguridad) | 2 | medium | 2,0 | medio | primer mes |
| P-29 | Portal y panel más livianos | Satisfacción | 2 | medium | 2,0 | bajo | primer mes |
| P-30 | Respaldos y migraciones al nivel del PRD | (continuidad) | 3 | high | 1,5 | bajo | antes del lanzamiento |
| P-31 | Ley 81: acceso y eliminación de datos personales | (legal) | 3 | high | 1,5 | medio | antes del lanzamiento |
| P-32 | Tablero con los 11 KPI de §3 | Todos (medición) | 3 | high | 1,5 | bajo | primer mes |
| P-33 | Búsqueda global, ficha de empresa y alta por WhatsApp o teléfono | Recompra, Cero retipeo | 3 | high | 1,5 | medio | primer mes |
| P-34 | Rechazar, cancelar y cambiar después de aprobar | Cierre (medición), Cumplimiento | 3 | high | 1,5 | medio | primer mes |
| P-35 | Avances y fotos de QA cargados por la fábrica | Cumplimiento, Satisfacción | 3 | high | 1,5 | medio | fase 2 |
| P-36 | Código más fácil de cambiar | (calidad) | 2 | high | 1,0 | medio | primer mes |
| P-37 | Preparar la fase 2: inglés, pagos en línea, API de WhatsApp y motor de precios | (fase 2) | 2 | high | 1,0 | bajo | fase 2 |

Antes del lanzamiento van 17 propuestas: 11 medium y 6 high. Todas están en la cola de `TAREAS-mejoras.md`, con un bloque por propuesta, para que Mark pueda aprobarlas o quitarlas una por una.

---

## Las cuatro preguntas

### Cómo subir la tasa de solicitudes completas a la primera (meta ≥ 85 %)

1. **Definir y medir.**
   - Hoy "completa" no está definida con precisión. Con las reglas del semáforo, basta que falten las referencias, el peso o las medidas del producto para que la solicitud quede amarilla (`lib/traffic-light.ts:46-48`), y esos tres datos son opcionales en el cotizador.
   - P-07 propone medir el KPI como "sin campos rojos al enviar", informar el verde aparte y congelar el semáforo inicial de cada solicitud.
2. **Quitar las causas de rojo que dependen del cliente** (P-09). Hoy el cliente puede elegir "Tengo el arte" sin subir ningún archivo por tres motivos:
   - su PNG o JPG se rechaza sin decirle dónde subirlo;
   - avanza con la subida en curso;
   - piensa mandarlo después.

   Con P-09, el cliente sube el archivo o elige "Lo envío después" (amarillo, con recordatorio).
3. **Empujar los amarillos sin volverlos obligatorios.**
   - El resumen dice qué falta y lleva al campo (P-17).
   - La galería suma una referencia en un toque.
   - No se vuelve obligatorio ningún campo: subiría el abandono.
4. **Evitar datos "completos pero falsos":**
   - "No sé" en impresión y frecuencia, para que el cliente no invente (P-16);
   - que el vendedor complete la ficha en el panel después de hablar con el cliente, en lugar de hacerlo fuera (P-21).
5. **Revisar el KPI cada semana** en el tablero (P-32) y atacar el campo que más falta.

### Cómo bajar el abandono del cotizador (meta ≤ 40 %)

1. **Medirlo.**
   - Hoy el abandono solo se ve en GA4, que no está configurado, y los borradores se purgan a los 30 días.
   - P-07 guarda en la base el paso máximo de cada borrador y conserva una fila sin datos personales al purgar.
2. **Quitar los tropiezos antes que acortar.** Completar el cotizador tomó entre 56 s y 3 min 15 s, según el ritmo y la cantidad de piezas (auditoría §6): no es largo. Lo que hace perder clientes son los tropiezos:
   - el gesto Atrás del celular saca del cotizador (P-08);
   - una falla de red al abrir borra el borrador del dispositivo (P-08);
   - el WhatsApp local de 8 dígitos se rechaza en el último paso, que es donde el cliente ya invirtió más: 46 de las 66 teclas del camino mínimo están en ese paso (P-10);
   - hay preguntas sin "No sé" (P-16) y jerga en los títulos (P-27).
3. **Recuperar a quien lo pidió:** un solo recordatorio a quien usó "Guardar y seguir después" (P-18), porque esa persona dio su correo para eso.
4. **Con datos por paso, atacar el paso con más salida.** No se recomienda todavía pedir el contacto al principio para poder recontactar: agrega fricción al inicio y exige consentimiento. Si se quiere probar, que sea con una prueba A/B en la fase 2.

### Cómo cotizar en menos de 24 horas hábiles con un solo vendedor

La cadena es: solicitud → revisión → (datos pendientes) → RFQ → respuesta de la fábrica → cotización. El vendedor controla todo menos la respuesta de la fábrica. Lo que propongo, en orden:

1. **Que nada se cuelgue:** con la configuración de producción, hoy la primera cotización de toda solicitud queda colgada (P-01).
2. **Que las alertas lleguen sin abrir el panel:** hoy el SLA de 4 h y de 24 h solo se revisa al abrir el panel o una vez al día (P-06).
3. **Una sola lista de trabajo:**
   - la bandeja con "Requiere acción" (P-24);
   - la cola de WhatsApp pendientes (P-22). Hoy cada mensaje cuesta 4 a 6 clics, porque primero hay que encontrar la solicitud.
4. **Cero retipeo:**
   - completar en el panel las solicitudes "No sé, sugiéranme", que hoy no se pueden llevar a RFQ sin trabajar fuera (P-21);
   - que la fábrica responda en un formulario y no por correo (P-25).
5. **Perseguir a la fábrica y medirla:**
   - recordatorio automático del RFQ sin respuesta;
   - tiempo de respuesta en horas hábiles (P-12);
   - acordar con la fábrica un tiempo de respuesta (pregunta 23 de `docs/PREGUNTAS.md`).
6. **Emitir sin miedo:** vista previa del PDF y confirmación (P-13), y los montos bien leídos (P-02).
7. **Medirlo bien:** en horas hábiles y sin contar los tramos en "Datos pendientes" (P-32). Hoy se mide en horas de reloj (D-085).

### Qué automatizar primero para la fábrica

**Lo que ya está automatizado:** el RFQ se genera en PDF y Excel y se envía por correo si hay `FACTORY_EMAIL`.

**Lo que sigue siendo manual:** perseguir la respuesta, retipearla, avisar a la fábrica que puede producir y subir sus avances.

**Qué automatizar, en orden:**
1. **Perseguir y medir la respuesta al RFQ** (P-12, medium). Es lo más barato y está en el camino crítico de las 24 h.
2. **La respuesta estructurada por enlace** (P-25, high). Elimina el último retipeo antes de cotizar y deja un historial de costos para el motor de precios interno (F2-3).
3. **La orden de producción automática al liberar** (P-15, medium). Hoy "Liberar" solo cambia un estado (`lib/artwork/staff.ts:147`), y el vendedor arma a mano el correo a la fábrica con la ficha, el arte y las cantidades.
4. **Los avances y las fotos de QA cargados por la fábrica** (P-35, fase 2). Mejora la visibilidad, pero mientras tanto el equipo puede seguir registrándolos.

**Por qué este orden:** la respuesta al RFQ está en el camino crítico del KPI de cotización; la orden de producción, en el del KPI de entrega; los avances, en el de satisfacción.

---

## Propuestas

### P-01 · Que nada se cuelgue ni se caiga en blanco

**Impacto** 5 · **Esfuerzo** medium · **Prioridad** 5,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:**
- Con `DB_POOL_MAX=1`, la configuración pensada para Vercel con el pooler de Supabase, el portal de todo pedido y la primera cotización de cada solicitud esperan una conexión que nunca se libera.
- Si hay un error inesperado, se ve la página genérica de Next.js, sin la marca y sin salida.

**Evidencia:**
- DAT-01, REN-01 y COD-01 (crítico): `withActor` dentro de `withActor` en `lib/orders/index.ts:787` y `:794` (`getClientOrder`) y en `lib/quotes/index.ts:195` (`createQuoteDraft`). Ninguna prueba corre con `DB_POOL_MAX=1`.
- DAT-05: numeración fuera de la transacción, con huecos y la posibilidad de dos borradores v1.
- COD-02: no hay `error.tsx`.

**Cambio:**
1. `getClientOrder`: validar el token y leer los montos y pagos en una sola transacción de servicio. De paso se elimina la doble lectura de pagos.
2. `createQuoteDraft`: numerar en la misma transacción, con una función `security definer` con permiso para el equipo. Bloquear la solicitud (`select … for update`) y crear un índice único parcial de borradores por solicitud.
3. Guarda en `withActor`: detecta el anidamiento (AsyncLocalStorage) y falla en desarrollo y en pruebas.
4. Prueba y paso de CI con `DB_POOL_MAX=1`.
5. Fronteras de error (`global-error`, `error`, y las del cotizador, el portal y el panel) con textos de `es.json`. La del cotizador avisa que el borrador está guardado.

**Impacto en los KPI:**
- Cotizar más rápido y Cierre: sin esto, ninguna solicitud se cotiza en producción.
- Cumplimiento y Satisfacción: el cliente no puede ver su pedido.
- Es condición para lanzar.

**Riesgo:** bajo. Toca dos funciones que ya tienen pruebas de base y de punta a punta. La guarda puede descubrir otros anidamientos, que es justo lo que se busca.

### P-02 · Montos y moneda sin ambigüedad en el panel

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:**
- El panel lee "5,000" como 5 dólares, y ese es justo el formato que muestra la pantalla (USD 5,000.00). Un costo o un pago escrito con coma de miles queda 1.000 veces más bajo.
- Si la fábrica, que está en Perú, responde en soles, el costo pasa a la cotización como si fueran dólares.

**Evidencia:**
- REG-01 (alto): `parseMoney` en `lib/quotes/pricing.ts:26` hace `replace(",", ".")`.
- REG-11, PAN-13 y FUT-12 (medio): la moneda de la respuesta del RFQ se guarda, pero se ignora.

**Cambio:**
- Un solo formato de entrada, el de la pantalla: punto decimal, y coma solo como separador de miles en grupos de 3. Lo ambiguo ("5,5", "5.000,50") se rechaza con un mensaje claro.
- Junto a cada campo de dinero se muestra el valor interpretado ("= USD 5,000.00") antes de guardar.
- La moneda de la fábrica sale de una lista cerrada. Si no es la de la cotización, no se puede preparar la cotización sin un tipo de cambio con fecha; se guardan el costo original y el convertido.

**Impacto en los KPI:**
- Cierre y margen: una cotización mal escrita es una cotización retirada, o dinero perdido.
- Cotizar más rápido: no hay que rehacer cotizaciones.

**Riesgo:** bajo. Solo cambia la entrada de datos del panel.

### P-03 · Estados manuales solo donde tienen sentido

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:** el selector de estado ofrece todas las transiciones, incluidas "RFQ enviado", "Cotizada" y "Aceptada". Marcarlas a mano se salta el RFQ, la cotización o el pedido. Una solicitud "Aceptada" a mano no tiene pedido y queda bloqueada, porque "Aceptada" es un estado final.

**Evidencia:**
- REG-03 y PAN-01 (alto); PAN-05 (medio); PAN-16 (bajo).
- `lib/states.ts:20-30`: el selector usa `REQUEST_TRANSITIONS` completo.
- COD-10: no hay prueba de que TypeScript y SQL coincidan.

**Cambio:**
- La lista `MANUAL_TRANSITIONS` (En revisión, Datos pendientes y rechazo con motivo) alimenta el selector.
- El trigger exige que RFQ enviado, Cotizada y Aceptada vengan de las funciones del sistema.
- Nuevo botón "Marcar RFQ enviado a mano", con destinatario y fecha, para cuando no hay correo de fábrica.
- Una prueba de paridad recorre todos los pares de estados, en TypeScript y en SQL.

**Impacto en los KPI:**
- Cierre: las aceptaciones cuentan de verdad y crean pedido.
- Cero retipeo.
- Reportes confiables: cada estado refleja un hecho.

**Riesgo:** medio, porque cambia el trigger de la máquina de estados. Lo cubren la prueba de paridad y las pruebas de punta a punta del ciclo.

### P-04 · Registrar la aceptación que llega por WhatsApp o llamada

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** el PRD §11 pide registrar a mano una aceptación que llega por WhatsApp. Hoy solo el cliente puede aceptar, desde su enlace. Si responde "dale" por WhatsApp, el vendedor no tiene cómo convertirlo en pedido, y el único camino que existe, el selector, deja la solicitud bloqueada.

**Evidencia:** PAN-01 (alto). En la auditoría §7, la fila "Cotización formal" figura como parcial.

**Cambio:**
- En la cotización emitida, el botón "Registrar aceptación del cliente" pide:
  - la cantidad elegida por pieza;
  - quién acepta;
  - el canal (WhatsApp, correo o llamada);
  - la fecha;
  - una captura opcional.
- Usa la misma función `acceptQuote`, crea el pedido y deja constancia en el historial y en la auditoría.

**Impacto en los KPI:**
- Cierre (≥ 25 %): en un mercado que negocia por WhatsApp, sin esto las aceptaciones no se registran o se registran mal.
- Cumplimiento: el plazo corre desde el pedido.

**Riesgo:** bajo. Reutiliza la aceptación que ya existe.

### P-05 · Nada entra a producción sin proof aprobado

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:**
- Una pieza que llegó como "No sé, sugiéranme" y termina impresa no tiene proof que aprobar, así que puede entrar a producción sin que el cliente vea el arte.
- Si hay un proof v2 pendiente, basta el v1 aprobado para producir.

**Evidencia:** REG-04 (alto) y REG-10 (medio).

**Cambio:**
- La condición de producción revisa, pieza por pieza, la última versión del proof.
- Una pieza "No sé" se trata como "impresión por definir": exige un proof aprobado o que el equipo la marque explícitamente como "sin impresión".
- La regla vive en la base y en `lib/orders`.

**Impacto en los KPI:**
- Arte utilizable (≥ 70 %) y Cumplimiento de entrega (≥ 90 %): un error de impresión es un pedido rehecho.
- Satisfacción.

**Riesgo:** bajo.

### P-06 · Alertas de SLA y avisos cada 15 minutos, sin pagar

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:**
- El SLA (4 h para revisar y 24 h para cotizar) solo se revisa cuando alguien abre el panel, o una vez al día con el cron de Vercel Hobby. Con un solo vendedor, la alerta llega tarde justo cuando más falta.
- Los correos que fallan se reintentan de inmediato, y se pierden si Resend limita los envíos.

**Evidencia:** REN-03 (medio; se hizo distinto en D-013 y D-054) y REN-02 (medio).

**Cambio:**
- `pnpm cron:install` registra en Supabase Cron una llamada a `/api/cron/notifications` cada 15 minutos. Supabase Cron (pg_cron y pg_net) está incluido en el plan gratuito. La URL y el secreto se leen del entorno y se guardan en Vault, no en el repositorio.
- Alternativa, si Mark contrata Vercel Pro: un cron de Vercel.
- Reintentos con espera creciente (5 min, 30 min y 2 h). Un 429 no cuenta como intento.
- El equipo recibe un aviso cuando hay envíos fallidos.

**Impacto en los KPI:**
- Cotizar más rápido (≤ 24 h).
- Satisfacción: los avisos no se pierden.

**Riesgo:** bajo. Se apaga quitando el job.

### P-07 · Guardar desde el primer día los datos de los KPI

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** el PRD calibra las metas con los primeros 60 días, pero tres KPI dependen de datos que hoy no se guardan o se borran:
- el abandono y los minutos del cotizador solo van a GA4, y los borradores se purgan a los 30 días;
- "completa a la primera" depende de un semáforo que cambiará cuando se recalcule (P-21).

Además, los reportes miden solo 2 de los 11 KPI.

**Evidencia:**
- PAN-14 (medio).
- Auditoría §6: el evento `wizard_submit` solo va a GA4.
- REG-12.
- DAT-16: los datos de demostración entran en los reportes.

**Cambio:**
- Por borrador: el paso máximo alcanzado y la hora de inicio. Al purgar, queda una fila sin datos personales (inicio, paso máximo, segmento, si se envió).
- Por solicitud: el semáforo y los faltantes iniciales, congelados al enviar, y los minutos que tomó completarla.
- Todo KPI excluye los datos DEMO.
- En `docs/DECISIONES.md`, la definición de "completa a la primera" (sin campos rojos al enviar) y la de "abandono".

**Impacto en los KPI:** permite medir desde el día 1 el Abandono (≤ 40 %), el Esfuerzo (≤ 5 min) y la Información completa (≥ 85 %). Esos 60 días no se recuperan después.

**Riesgo:** bajo. Son columnas nuevas y el flujo no cambia.

### P-08 · El cotizador no pierde el avance

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:**
- En el celular, el gesto Atrás saca del cotizador en lugar de volver al paso anterior.
- Si la red falla al abrirlo, la copia local se pisa con un estado vacío.
- Un borrador viejo reaparece siempre, y no hay forma de empezar de cero.

**Evidencia:**
- UX-02, UX-11 y UX-06 (medio); UX-16 y COD-09.
- Auditoría §6: no hay pruebas de red caída ni del gesto Atrás.

**Cambio:**
- Cada paso queda en el historial del navegador, y Atrás vuelve al paso anterior.
- La recuperación conserva el estado y el token locales si la red falla.
- Aviso "Retomamos tu solicitud del {fecha}" con la opción "Empezar una nueva".
- El borrador local se valida y se migra con el esquema compartido.

**Impacto en los KPI:** Abandono (≤ 40 %) y Conversión web. En Android, el gesto Atrás es el reflejo más común, y hoy le cuesta al cliente toda la sesión.

**Riesgo:** medio. El historial y la recuperación son delicados; los cubren pruebas nuevas de punta a punta.

### P-09 · Arte completo a la primera

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** si el cliente elige "Tengo el arte" y no sube ningún archivo, la solicitud queda en rojo. Pasa por tres motivos:
- su PNG o JPG se rechaza sin decirle dónde subirlo;
- avanza mientras la subida sigue en curso, y el archivo se pierde;
- piensa mandarlo después.

**Evidencia:** `lib/traffic-light.ts:41-45`; UX-03 y UX-04 (medio).

**Cambio:**
- Con "Tengo el arte", Continuar exige un archivo o la opción "Lo envío después", que deja el arte pendiente (amarillo) y activa el recordatorio.
- PNG y JPG entran como referencia, con el aviso "te pediremos el vectorial".
- Continuar y Enviar esperan a que terminen las subidas, con el progreso a la vista.

**Impacto en los KPI:**
- Información completa (≥ 85 %): elimina la única causa de rojo que depende del cliente.
- Arte utilizable.
- Cotizar más rápido: hay que pedir menos datos al cliente.

**Riesgo:** bajo. Puede sumar un toque en el paso 7.

### P-10 · WhatsApp local y contacto en el orden natural

**Impacto** 4 · **Esfuerzo** medium · **Prioridad** 4,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** el paso de contacto concentra 46 de las 66 teclas del camino mínimo, y ahí:
- se rechaza el número local de 8 dígitos ("6123-4567"), porque exige el +507;
- los campos opcionales aparecen antes que los obligatorios.

**Evidencia:** UX-05 (medio). `normalizeWhatsapp` (`lib/quote/validate.ts:95`) exige "+" o "00".

**Cambio:**
- Se aceptan 8 dígitos que empiezan por 6 y se guardan como +507: el número sigue guardándose con código de país, como pide el PRD.
- Orden de los campos: nombre, WhatsApp, correo, ciudad, dirección y, al final, los opcionales.
- `enterKeyHint` en cada campo.

**Impacto en los KPI:** Abandono y Esfuerzo del cliente. El error aparece en el último paso, cuando el cliente ya invirtió más.

**Riesgo:** bajo.

### P-11 · Guía de despliegue con los planes correctos

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** `docs/deploy.md` y `docs/lanzamiento.md` llevan a Supabase Free y a Vercel Hobby.
- Vercel Hobby no permite uso comercial.
- En Supabase Free, el espacio de archivos se acaba en 1 a 6 semanas con 100 solicitudes al mes.
- Los previews usarían la base, los archivos y el correo de producción.

**Evidencia:** REN-11, REN-12 y REN-07 (medio); auditoría §8, tablas D y E.

**Cambio:** documentar, sin contratar nada:
- **Configuración recomendada:** Supabase Pro + Vercel Pro, unos USD 45 al mes con 100 solicitudes. Son precios de 2025 y hay que verificarlos.
- **Previews:** un segundo proyecto Supabase Free, sin correo real.
- **Tamaño de archivos:** el paso para subir el límite. `verify:deploy` compara el límite de cada bucket con `max_file_mb`.
- **Decisión de Mark:** pregunta 20 de `docs/PREGUNTAS.md`.

**Impacto en los KPI:** evita que a las pocas semanas empiecen a fallar las subidas (Información completa y Arte utilizable) y que se incumplan los términos de Vercel.

**Riesgo:** bajo.

### P-12 · Recordatorio del RFQ sin respuesta y tiempo de la fábrica medido

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:** el RFQ sale solo, pero nadie persigue la respuesta:
- no hay alerta si la fábrica no contesta;
- no se mide su tiempo de respuesta, que es una métrica de salud de §3.

Con un solo vendedor, esa espera es la parte de las 24 h que él no controla.

**Evidencia:** PAN-06 (medio); auditoría §7: "Métricas de salud de §3 sin reporte: tiempo de respuesta de la fábrica".

**Cambio:**
- Setting `rfq_reminder_business_hours`, PROVISIONAL. Propuesta: la mitad del SLA de cotización.
- Pasado ese tiempo, el cron reenvía el RFQ a la fábrica como recordatorio y avisa al vendedor.
- Reporte del tiempo de respuesta de la fábrica en horas hábiles.

**Impacto en los KPI:**
- Cotizar más rápido.
- Cumplimiento: se detecta pronto si la fábrica viene lenta.

**Riesgo:** bajo.

### P-13 · Emitir con vista previa y respuesta de la fábrica flexible

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- "Emitir y enviar" no tiene vista previa ni confirmación, y no avisa si un margen está fuera de lo normal.
- La respuesta de la fábrica exige un costo para todas las cantidades.
- La respuesta ignora los días de producción, así que el plazo prometido puede quedar por debajo de lo que la fábrica necesita.

**Evidencia:** PAN-08, PAN-09 y REG-08 (medio).

**Cambio:**
- Vista previa del PDF desde el borrador, y confirmación con el total por pieza.
- Aviso de margen mínimo (setting PROVISIONAL) y de flete en 0.
- La fábrica puede dejar una cantidad "sin cotizar".
- El plazo se propone con los días de producción más el tránsito (setting PROVISIONAL).
- El pedido conserva la fecha prometida original, para detectar atrasos.

**Impacto en los KPI:**
- Cierre: no hay que retirar cotizaciones mal emitidas.
- Cumplimiento de entrega.

**Riesgo:** bajo.

### P-14 · Revisión de arte e hitos con menos clics

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- Revisar una versión de arte cuesta 13 clics (18 con el WhatsApp del proof y la liberación), sin vista previa en la página, y solo lo puede hacer la persona asignada.
- Registrar un hito con foto toma dos pasos, y el aviso al cliente sale antes de que exista la foto.

**Evidencia:** PAN-10 y PAN-11 (medio); tabla de clics por tarea de la auditoría §7.

**Cambio:**
- Botón "Marcar todo Correcto".
- La versión pasa a En revisión al abrir el archivo.
- Miniatura del arte en la página.
- Fotos en el mismo formulario del hito, y aviso al cliente cuando termina la subida.

**Impacto en los KPI:**
- Cotizar más rápido y Arte utilizable: con un solo vendedor, los clics por pieza se vuelven horas por semana.
- Satisfacción: el aviso llega con su foto.

**Riesgo:** bajo. El checklist sigue a la vista, para que la revisión no se vuelva rutina.

### P-15 · Orden de producción automática al liberar

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** medio · **Fase** primer mes

**Problema:** con el anticipo confirmado y el proof liberado, la plataforma cambia los estados pero no le manda nada a la fábrica. El vendedor arma a mano el correo con:
- la ficha final;
- el arte liberado;
- las cantidades aceptadas;
- la fecha comprometida.

Es el mismo retipeo que el RFQ eliminó.

**Evidencia:**
- `lib/artwork/staff.ts:147`: `releaseProof` solo cambia el estado.
- No existe ningún envío a la fábrica después del RFQ.
- KPI Cero retipeo.

**Cambio:**
- Cuando se cumplen el anticipo completo (P-20) y los proofs liberados (P-05), se genera la "Orden de producción" en PDF, con enlaces firmados al arte que vencen.
- Se envía al correo de la fábrica, o se simula si no hay credenciales.
- En la primera versión, el vendedor la confirma con una vista previa antes del envío.
- El formato lo decide Mark (pregunta 7 de `docs/PREGUNTAS.md`).

**Impacto en los KPI:**
- Cero retipeo (100 %).
- Cumplimiento: la fábrica arranca el mismo día.
- Menos errores de versión de arte.

**Riesgo:** medio. Un envío equivocado a la fábrica es caro, y por eso la primera versión lleva confirmación.

### P-16 · "No sé" donde falta y "Sugiéranme" arriba

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** medio · **Fase** primer mes

**Problema:**
- Impresión y frecuencia no tienen la opción "No sé".
- En alimentos, la aptitud es obligatoria aunque el material sea "No sé".
- "No sé, sugiéranme" aparece al final de una lista de 11 a 18 tipos.

El cliente que no sabe elige cualquier cosa o abandona.

**Evidencia:** UX-01, UX-07 y UX-08 (medio).

**Cambio:**
- "No sé, asesórenme" en impresión.
- "Aún no lo sé" en frecuencia.
- La aptitud viene premarcada según lo que el cliente declaró, y se puede desmarcar.
- "No sé, sugiéranme" queda fijo arriba de los tipos.

**Impacto en los KPI:**
- Abandono y Esfuerzo.
- Información completa: el cliente inventa menos datos.
- Sube el trabajo de asesoría, así que necesita P-21.

**Riesgo:** medio. Más respuestas "No sé" significan más trabajo para el vendedor; se mide con P-07.

### P-17 · Completitud guiada en el resumen

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** medio · **Fase** primer mes

**Problema:** casi toda solicitud llega amarilla. El peso, las medidas y las referencias son opcionales, y el cliente no sabe que ayudan a cotizar. El resumen no dice qué falta.

**Evidencia:** `lib/traffic-light.ts:46-48`; UX-13 y UX-15 (bajo).

**Cambio:**
- El paso 9 muestra un bloque "Para cotizarte más rápido" con los faltantes de cada pieza, calculados con el mismo semáforo y sin precios.
- Cada faltante tiene el enlace "Completar", que lleva al campo.
- En la galería, "Quiero algo así" suma la referencia en un toque.
- No se vuelve obligatorio ningún campo. Los datos de P-07 dicen cuál empujar primero.

**Impacto en los KPI:**
- Información completa, si el KPI cuenta el verde.
- Cotizar más rápido.

**Riesgo:** medio. Más contenido al final puede subir el abandono; hay que medirlo.

### P-18 · Recordatorio a quien pidió "guardar y seguir después"

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:** quien usa "Guardar y seguir después" recibe su enlace una sola vez. Si se le olvida, el borrador se purga a los 30 días sin que nadie le recuerde.

**Evidencia:**
- `components/wizard/save-later.tsx`.
- Auditoría §6 (purga a los 30 días).
- SEG-04: el enlace debe ir solo al correo guardado.

**Cambio:**
- Un único recordatorio a los N días (setting PROVISIONAL) si la solicitud no se envió.
- La pantalla de "Guardar" lo avisa ("te lo recordaremos una vez").
- El recordatorio trae un enlace para no recibir más avisos.
- Se hace después de P-23, que protege ese formulario con captcha.

**Impacto en los KPI:** Abandono y Conversión web. Esa persona ya mostró intención y dio su correo para esto.

**Riesgo:** bajo.

### P-19 · Consentimiento de WhatsApp e idioma por solicitud

**Impacto** 3 · **Esfuerzo** medium · **Prioridad** 3,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- No se registra el consentimiento para recibir avisos por WhatsApp, y la API de WhatsApp Business (F2-4) lo exige: a cada cliente que entre sin él habrá que pedírselo de nuevo.
- La solicitud no guarda el idioma.

**Evidencia:** FUT-07 y FUT-06 (medio).

**Cambio:**
- Casilla opcional en el paso 8. Se guardan la fecha del alta y de la baja, y el envío de avisos las respeta.
- `locale = 'es'` por solicitud.
- La política de privacidad se actualiza con un texto PROVISIONAL hasta la revisión legal (pregunta 11 de `docs/PREGUNTAS.md`).

**Impacto en los KPI:** no mueve un KPI del MVP. Abarata F2-4 y F2-7 y baja el riesgo legal. Cada mes sin la casilla son clientes sin consentimiento registrado; Mark puede adelantarla.

**Riesgo:** bajo.

### P-20 · Pagos conciliados por monto

**Impacto** 5 · **Esfuerzo** high · **Prioridad** 2,5 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:** cualquier pago confirmado cuenta como anticipo o saldo completo. Por ejemplo, un abono de USD 100 sobre un anticipo de USD 5.000:
- pone el pedido en "Anticipo recibido";
- arranca el plazo y habilita la producción;
- corta los recordatorios;
- permite cerrar el pedido.

Tampoco se puede anular un pago mal cargado, y nada impide cargarlo dos veces.

**Evidencia:**
- DAT-02, REG-02, PAN-02 y FUT-01 (alto).
- REG-13: el centavo impar.
- REG-06: las reglas del pedido viven solo en la aplicación.
- COD-03: duplicados.

**Cambio:**
- **Estado por suma:** el anticipo está cubierto cuando lo confirmado alcanza el monto, con una tolerancia de 0 hasta que Mark responda la pregunta 19.
- **Pagos parciales a la vista:** estado "parcial", con Cotizado, Pagado y Pendiente, en el panel y en el portal.
- **Comprobantes:** al confirmarlos se elige el tipo, anticipo o saldo.
- **Anulación y duplicados:** se puede anular un pago con motivo, y queda auditado. Un índice único por referencia evita cargarlo dos veces.
- **Montos en centavos:** sin centavos perdidos entre anticipo y saldo.
- **Reglas en la base:**
  - producción exige el anticipo cubierto;
  - cerrar exige el saldo cubierto;
  - los montos del pedido no se editan: un cambio pasa por una cotización nueva.

**Impacto en los KPI:**
- Cumplimiento: el plazo arranca con el anticipo real.
- Recompra y Satisfacción: no se cobra de más ni de menos, y no se produce sin pago.
- Protege la caja.

**Riesgo:** medio. Cambia la máquina del pedido; como todavía no hay datos reales, el mejor momento para hacerlo es antes de lanzar.

### P-21 · Editar la ficha, las cantidades y el contacto desde el panel

**Impacto** 5 · **Esfuerzo** high · **Prioridad** 2,5 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:** el panel no deja editar la pieza, las cantidades ni el contacto.
- Las solicitudes "No sé, sugiéranme", que son el camino más corto del cotizador, necesitan que el vendedor defina tipo, tamaño y material antes del RFQ. Hoy eso se hace fuera del sistema.
- Tampoco se puede corregir un correo mal escrito, ni agregar la cantidad que el cliente pidió por WhatsApp.

**Evidencia:**
- PAN-03 (alto); REG-04; REG-12.
- Auditoría §7: "Editar datos técnicos de una pieza: no".

**Cambio:**
- "Editar pieza", para el equipo de ventas, antes del RFQ o de la cotización. Usa el mismo catálogo, las compatibilidades y la validación del cotizador.
- Cada edición crea una versión nueva de la ficha, con historial y auditoría, y recalcula el semáforo actual; el inicial de P-07 no cambia.
- Un aviso indica si ya hay un RFQ o una cotización sobre la versión anterior.
- Se pueden agregar o quitar cantidades.
- El contacto se puede editar, con auditoría (sirve también para la rectificación de la Ley 81).

**Impacto en los KPI:**
- Cero retipeo (100 %) y Cotizar más rápido.
- Información completa.

**Riesgo:** medio. Toca la ficha que alimenta el RFQ, la cotización y el pedido; versionarla protege los documentos ya emitidos.

### P-22 · Cola de WhatsApp y avisos por los dos canales

**Impacto** 4 · **Esfuerzo** high · **Prioridad** 2,0 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:**
- En el MVP, cada WhatsApp lo manda una persona. Los avisos automáticos (recordatorios de saldo, hitos, datos faltantes) quedan pendientes dentro de cada solicitud, sin lista global ni contador. Si nadie abre esa solicitud, el cliente no se entera.
- Cinco avisos existen solo por WhatsApp y dos solo por correo.

**Evidencia:**
- PAN-04 y FUT-02 (alto); PAN-15 (bajo).
- Auditoría §7: 4 a 6 clics por mensaje, y la bandeja oculta las Aceptadas.

**Cambio:**
- **`/admin/whatsapp`:** los avisos pendientes con su antigüedad, filtro por responsable y "Abrir y marcar enviado" en un toque.
- **Contador en el menú.**
- **Resumen diario por correo** con los WhatsApp pendientes de más de 2 horas hábiles (setting PROVISIONAL).
- **Plantillas de respaldo** en el otro canal (textos PROVISIONAL).
- **Enlace de seguimiento:** "Copiar enlace de seguimiento" y "Reenviar por WhatsApp".

**Impacto en los KPI:**
- Cotizar más rápido: el aviso de la cotización llega.
- Cierre: salen los recordatorios de vencimiento.
- Cumplimiento, Satisfacción y Recompra.

**Riesgo:** bajo.

### P-23 · Cerrar el abuso anónimo y proteger la cuenta de administrador

**Impacto** 4 · **Esfuerzo** high · **Prioridad** 2,0 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:**
- Sin cuenta ni captcha, una sola IP puede crear unos 600 borradores cada 10 minutos (unos 150 MB) y pedir subidas que nunca confirma, hasta llenar la base y el Storage.
- Los formularios públicos pueden mandar correos de la marca a cualquier dirección.
- El rol de admin se asigna a quien se registre con `ADMIN_EMAIL`, sin verificar el correo, y el registro público de Supabase viene abierto.
- Dos variables de prueba debilitan la seguridad si llegan a producción.

**Evidencia:** SEG-01 (alto), REN-08, SEG-04, SEG-05 y SEG-06 (medio), SEG-09 (bajo).

**Cambio:**
- **Topes** (settings PROVISIONAL):
  - un tope propio para crear borradores por IP y hora;
  - un tamaño máximo más bajo por borrador;
  - las subidas se cuentan al firmarlas, y el cron borra las no confirmadas.
- **Turnstile** obligatorio en producción, también en "Guardar y seguir después".
- **Cuenta de administrador:** la crea un script de servidor, y `deploy.md` indica cerrar el registro público.
- **Variables de prueba:** el arranque falla si están en producción.
- **Instrucciones de pago:** dejan de ser públicas.

**Impacto en los KPI:**
- Conversión y Abandono dependen de que el cotizador esté en pie.
- Protege el panel y la reputación del correo de la marca.

**Riesgo:** medio. Un tope muy bajo puede frenar a clientes reales que comparten IP, como una oficina; por eso los topes son configurables.

### P-24 · Bandeja "Requiere acción" y pendientes por persona

**Impacto** 4 · **Esfuerzo** high · **Prioridad** 2,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- Lo que pasa después de cotizar no aparece como pendiente: el cliente respondió, subió arte o un comprobante, pidió cambios, o hay un WhatsApp por enviar.
- Los pedidos no tienen responsable.
- La bandeja corta en 500 filas antes de ordenar por urgencia.
- "Tomar" y "Siguiente" fallan sin mensaje.

**Evidencia:** PAN-06, REN-05 y COD-15 (medio); PAN-17 (bajo).

**Cambio:**
- Columna y filtro "Requiere acción", con el motivo.
- Responsable por pedido.
- El SLA se extiende a comprobantes sin revisar y a pedidos sin hito (plazos PROVISIONAL).
- El orden por urgencia y la paginación se hacen en SQL.
- Los errores se ven.

**Impacto en los KPI:**
- Cotizar más rápido: el único vendedor tiene una sola lista de "lo de hoy".
- Cumplimiento y Satisfacción.

**Riesgo:** bajo.

### P-25 · Respuesta de la fábrica por enlace seguro

**Impacto** 4 · **Esfuerzo** high · **Prioridad** 2,0 · **Riesgo** medio · **Fase** primer mes

**Problema:** la fábrica responde el RFQ por correo, y el vendedor retipea los costos de cada cantidad, la moneda y los días de producción. Es el último retipeo antes de cotizar.

**Evidencia:**
- PAN-09 (medio).
- Auditoría §7: registrar la respuesta de la fábrica.
- PRD, tabla de integraciones: "Portal de fábrica con respuesta estructurada".
- F2-6.

**Cambio:**
- El RFQ lleva un enlace con token propio, que vence al cotizar.
- En esa página, la fábrica ve la ficha y escribe costos, moneda, días y notas. Lo que escribe se guarda igual que `recordRfqResponse`, y el vendedor lo revisa.
- Sin precios de venta en la página.
- Adelanta parte de F2-6; lo decide Mark.

**Impacto en los KPI:**
- Cotizar más rápido y Cero retipeo.
- Deja un historial estructurado de costos para el motor de precios interno.

**Riesgo:** medio. Es una superficie pública nueva, con el mismo patrón que ya se usa y se probó en el portal del cliente.

### P-26 · Feriados en plazos y SLA

**Impacto** 2 · **Esfuerzo** medium · **Prioridad** 2,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:** el SLA en horas hábiles y la fecha estimada de entrega ignoran los feriados, así que la entrega puede caer en domingo o en feriado.

**Evidencia:** REG-07 (medio).

**Cambio:**
- Setting `holidays`: una lista de fechas PROVISIONAL, editable.
- La fecha de entrega se corre al siguiente día hábil.
- Pregunta para Mark: ¿los 30 o 45 días son corridos o hábiles?

**Impacto en los KPI:** Cumplimiento (fechas creíbles) y un SLA justo en las semanas con feriados.

**Riesgo:** bajo.

### P-27 · Textos claros, resumen corto y teclado

**Impacto** 2 · **Esfuerzo** medium · **Prioridad** 2,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- Los títulos usan jerga, y hay preguntas amables ya escritas que no se usan.
- En el celular, el resumen es largo y muestra códigos internos y la fecha en formato ISO.
- El progreso engaña cuando hay varias piezas.
- Enter no avanza.

**Evidencia:** UX-09 (medio); UX-12, UX-13 y UX-14 (bajo).

**Cambio:**
- Títulos como preguntas ("¿Qué vas a empacar?").
- Resumen compacto, con la fecha formateada.
- Progreso por tramos ("Pieza 2 de 2 · 1 de 4").
- Enter lleva al campo siguiente.

**Impacto en los KPI:** Esfuerzo y Abandono. Son mejoras graduales.

**Riesgo:** bajo. Hay que revisar las pruebas que buscan por texto.

### P-28 · Enlace de seguimiento: regenerar, copiar y guardar solo el hash

**Impacto** 2 · **Esfuerzo** medium · **Prioridad** 2,0 · **Riesgo** medio · **Fase** primer mes

**Problema:** el enlace del cliente:
- no vence ni se puede revocar;
- se guarda en claro;
- se copia en los avisos que ve todo el equipo.

Si se reenvía por error, quien lo reciba puede aprobar proofs y aceptar cotizaciones.

**Evidencia:** SEG-03 y DAT-07 (medio); PAN-15 (bajo).

**Cambio:**
- "Regenerar enlace".
- En la base se guarda solo el hash del token.
- Los avisos guardados muestran el token enmascarado.
- Vencimiento opcional después del cierre (PROVISIONAL).

**Impacto en los KPI:** seguridad y confianza; efecto indirecto en la Satisfacción.

**Riesgo:** medio. Cambia cómo se buscan las solicitudes, así que la migración debe ser cuidadosa.

### P-29 · Portal y panel más livianos

**Impacto** 2 · **Esfuerzo** medium · **Prioridad** 2,0 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- El portal firma una URL por evidencia en cada visita y usa las fotos originales como miniaturas. Si falla Storage, se cae la página.
- Cada vista del panel hace 2 llamadas a Auth y 5 transacciones extra.
- Las políticas RLS evalúan funciones fila por fila.

**Evidencia:** REN-04, REN-14, REN-06 y DAT-15 (medio y bajo).

**Cambio:**
- URLs firmadas en lote, con tolerancia a fallos.
- Miniatura WebP al subir cada foto.
- `getClaims` en lugar de `getUser`.
- Los procesos pendientes (`runDueJobs`) corren solo desde el cron (después de P-06).
- Políticas `(select public.is_staff())`.
- Los índices que faltan.
- Una prueba de volumen.

**Impacto en los KPI:** Satisfacción (el portal carga rápido en el celular) y menos egress (auditoría §8).

**Riesgo:** bajo. Las pruebas de seguridad cubren el cambio de políticas.

### P-30 · Respaldos y migraciones al nivel del PRD

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** bajo · **Fase** antes del lanzamiento

**Problema:** el PRD §15 pide "respaldos diarios de base de datos y archivos con retención de 30 días". Hoy:
- se guarda solo la base, durante 7 días;
- no se respaldan los archivos (arte, proofs, evidencias);
- no se incluye el mapeo de usuarios;
- nunca se probó restaurar en una base vacía.

Además, una migración ya aplicada se puede editar sin que nada lo detecte; ya pasó en desarrollo con la 003.

**Evidencia:** DAT-04 (alto), REN-10, DAT-11 y DAT-12 (medio).

**Cambio:**
- **Base:** retención de 30 días, y respaldo del id y el correo de cada usuario.
- **Archivos:** copia diaria de los buckets a un destino configurable por variables. Sin credenciales, el job avisa y no falla. No se contrata ningún almacenamiento.
- **Restauración:** un ensayo automático en CI.
- **Migraciones:** el hash de cada migración aplicada se guarda, y `db:migrate` falla si el archivo cambió. `pg_dump` previo obligatorio contra Supabase.

**Impacto en los KPI:** ninguno directo. Evita perder el arte de los clientes, los pedidos y los pagos. Es un requisito del PRD §15.

**Riesgo:** bajo.

### P-31 · Ley 81: acceso y eliminación de datos personales

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** medio · **Fase** antes del lanzamiento

**Problema:** el PRD §15 pide "derecho de acceso y eliminación atendido desde el panel", y hoy no hay cómo hacerlo. Los datos personales están copiados en solicitudes, empresas, borradores, avisos, historial y auditoría, y aparecen en los logs de producción.

**Evidencia:** DAT-03 (alto); SEG-07, PAN-12 y SEG-02 (medio).

**Cambio:**
- **Buscar y exportar** (solo admin): por correo o WhatsApp, todo lo del titular.
- **Anonimizar:** una función reemplaza los datos personales en todas las tablas y borra los archivos del titular.
  - Conserva los montos y los números de documento.
  - Deja constancia en la auditoría.
  - Pide doble confirmación.
- **Logs:** sin tokens ni datos personales.
- **Qué se conserva y cuánto tiempo:** pregunta 22 de `docs/PREGUNTAS.md`.

**Impacto en los KPI:** cumplimiento legal (Ley 81 de 2019). Da confianza, lo que ayuda a la Satisfacción y la Recompra.

**Riesgo:** medio. La anonimización no se puede deshacer; por eso lleva doble confirmación y prueba de base.

### P-32 · Tablero con los 11 KPI de §3

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** bajo · **Fase** primer mes

**Problema:**
- Reportes mide 2 de los 11 KPI, y en horas de reloj.
- No muestra montos, NPS ni cuentas por cobrar.
- El SLA de cotización cuenta el tiempo en "Datos pendientes".

**Evidencia:** PAN-14 y REG-05 (medio); D-085.

**Cambio:**
- Los 11 KPI con la meta del PRD y su CSV.
- El tiempo a cotización en horas hábiles, sin los tramos en "Datos pendientes".
- Encuestas NPS con su comentario, y aviso al equipo cuando la nota es 6 o menos.
- Cuentas por cobrar.
- Margen, solo para admin.
- Sin datos DEMO.

**Impacto en los KPI:** permite gestionarlos todos y calibrar las metas a los 60 días, como pide el PRD §3.

**Riesgo:** bajo.

### P-33 · Búsqueda global, ficha de empresa y alta por WhatsApp o teléfono

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** medio · **Fase** primer mes

**Problema:**
- La búsqueda solo cubre las solicitudes abiertas.
- No hay una pantalla por empresa.
- Una solicitud que llega por WhatsApp o por teléfono no se puede cargar.
- Las empresas duplicadas por RUC no se pueden fusionar.

**Evidencia:** PAN-07 y DAT-06 (medio).

**Cambio:**
- Búsqueda en todos los estados, por S-, C-, P-, correo, WhatsApp y RUC.
- `/admin/empresas/[id]`, con historial y notas.
- Fusión de empresas, auditada.
- Botón "Nueva solicitud" en el panel, que manda al cliente el enlace para confirmar sus datos y dar el consentimiento.

**Impacto en los KPI:**
- Recompra (≥ 30 %).
- Cero retipeo, y todo entra por el mismo embudo.

**Riesgo:** medio. El alta manual tiene que respetar el consentimiento.

### P-34 · Rechazar, cancelar y cambiar después de aprobar

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** medio · **Fase** primer mes

**Problema:**
- Una solicitud que no se puede cotizar (duplicada, spam o fuera de alcance) no tiene salida antes de cotizar.
- Un pedido no se puede cancelar.
- "Aceptada" es un estado final, sin camino para los cambios después de la aprobación que describe el PRD §14.

**Evidencia:** DAT-13 y REG-09 (medio).

**Cambio:**
- Rechazo con motivo desde los estados previos a la cotización.
- Pedido cancelado, con motivo.
- "Recotizar cambio": crea la versión N+1 enlazada al pedido.
- La decisión se registra en `docs/DECISIONES.md`.

**Impacto en los KPI:**
- Cierre: se mide solo sobre lo que se podía cotizar.
- Cumplimiento: los cambios quedan registrados.

**Riesgo:** medio. Toca la máquina de estados; P-03 aporta la prueba de paridad.

### P-35 · Avances y fotos de QA cargados por la fábrica

**Impacto** 3 · **Esfuerzo** high · **Prioridad** 1,5 · **Riesgo** medio · **Fase** fase 2

**Problema:** los hitos y las fotos de QA vienen de la fábrica, pero el equipo los recibe por fuera y los vuelve a subir, un hito a la vez.

**Evidencia:** auditoría §7 (un hito con foto cuesta 7 u 8 clics y 3 pantallas); PAN-11; F2-6.

**Cambio:**
- Con el enlace de P-25, la fábrica registra la producción, el QA (con checklist y fotos) y el embarque.
- El vendedor lo valida antes de que lo vea el cliente.

**Impacto en los KPI:** Cumplimiento, Satisfacción y Cero retipeo.

**Riesgo:** medio. Todo lo que ve el cliente pasa por la validación del vendedor.

### P-36 · Código más fácil de cambiar

**Impacto** 2 · **Esfuerzo** high · **Prioridad** 1,0 · **Riesgo** medio · **Fase** primer mes

**Problema:**
- `lib/orders/index.ts` tiene 921 líneas y 7 responsabilidades.
- El cotizador tiene 458 líneas sin pruebas unitarias.
- Hay validadores repetidos con variantes que divergen.
- No hay medición de cobertura.

**Evidencia:** COD-05, COD-06, COD-07, COD-08 y COD-11 (medio); REG-15 y COD-13 (bajo).

**Cambio:**
- Dividir `lib/orders`. Conviene hacerlo junto con P-20.
- Extraer los hooks del cotizador y probarlos.
- Un único `lib/validation.ts`.
- Cobertura con umbral del 80 % en los módulos de reglas.
- Helpers de pruebas compartidos.

**Impacto en los KPI:** indirecto. Menos regresiones al ejecutar el resto de las mejoras.

**Riesgo:** medio, como todo refactor; lo mitigan las 193 pruebas actuales.

### P-37 · Preparar la fase 2: inglés, pagos en línea, API de WhatsApp y motor de precios

**Impacto** 2 · **Esfuerzo** high · **Prioridad** 1,0 · **Riesgo** bajo · **Fase** fase 2

**Evidencia:** FUT-03 a FUT-14 y auditoría §10.

**Qué habría que tocar** (se ejecuta dentro de cada bloque F2):
- **Inglés (F2-7):**
  - conviene estimarlo como high, no medium;
  - formateadores con idioma y rutas generadas;
  - traducciones del catálogo por idioma;
  - fichas con nombres por idioma;
  - plantillas por idioma;
  - prefijo `/en`, con el español sin prefijo.
- **WhatsApp API (F2-4):**
  - id del mensaje del proveedor y estados de entrega;
  - plantillas aprobadas por Meta;
  - mensajes entrantes enlazados por número, que ya está en formato +E.164.
  - Necesita P-19.
- **Pagos en línea (F2-5):**
  - intenciones de pago;
  - webhook firmado;
  - estados de fallo y de reembolso;
  - CSP para el proveedor.
  - Necesita P-20 y el ITBMS numérico (pregunta 1 de `docs/PREGUNTAS.md`).
- **Motor de precios (F2-3):**
  - el origen del precio en cada línea;
  - márgenes por segmento;
  - historial de costos de la fábrica (P-25).
  - Es solo de uso interno: el cliente nunca ve un precio automático.

**Impacto en los KPI:** abarata la fase 2; no mueve los KPI del MVP.

**Riesgo:** bajo.

---

## Qué depende de Mark

Estas preguntas de `docs/PREGUNTAS.md` cambian cómo se ejecutan algunas propuestas. Mientras no haya respuesta, se usa la opción más conservadora, marcada como PROVISIONAL:

| Pregunta | Qué afecta | Mientras tanto |
| --- | --- | --- |
| 1. ITBMS en los pagos | P-20 y P-37 | Montos sin impuesto, con la leyenda |
| 7. Formato del RFQ | P-15 y P-25 | El mismo formato de la ficha |
| 19. Pagos en varias partes y tolerancia | P-20 | Se suman los pagos, con tolerancia 0 |
| 20. Planes pagos para producción | P-11 | Solo se documenta; no se contrata nada |
| 21. Retención de evidencias y comprobantes | P-30 y P-31 | No se borra nada automáticamente |
| 22. Qué conservar al anonimizar | P-31 | Se conservan los montos y los números de documento |
| 23. Tiempo de respuesta acordado con la fábrica | P-12 | La mitad del SLA de cotización (PROVISIONAL) |
