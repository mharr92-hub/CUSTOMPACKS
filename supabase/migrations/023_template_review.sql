-- =============================================================================
-- 023_template_review — Revisión de redacción de las plantillas PROVISIONAL
-- (Bloque 3). Solo cambia las que siguen con el texto original: si alguien ya
-- las editó en el panel, se respeta su versión. Siguen PROVISIONAL hasta que
-- Mark las guarde en Panel → Plantillas.
-- =============================================================================

create function pg_temp.revise(p_code text, p_channel public.message_channel, p_old_body text, p_body text, p_old_subject text default null, p_subject text default null)
returns void language sql as $$
  update public.message_templates
     set body = p_body,
         subject = case when p_old_subject is not null and subject = p_old_subject then p_subject else subject end
   where code = p_code and channel = p_channel and body = p_old_body and is_provisional;
$$;

-- Aviso interno de aceptación: más directo, sin "el cliente de".
select pg_temp.revise('quote_accepted_team', 'email',
  'El cliente de {empresa} aceptó la cotización de la solicitud {numero}. El pedido ya está creado: solicita el anticipo y revisa el arte: {enlace_panel}.',
  '{empresa} aceptó la cotización de la solicitud {numero} y el pedido ya está creado. Pide el anticipo y revisa el arte: {enlace_panel}.');

-- Hito de QA: la plantilla solo se usa al cerrar el control de calidad; el
-- correo dice lo mismo que el WhatsApp aprobado.
select pg_temp.revise('order_milestone', 'email',
  '{nombre}, tu pedido {numero_pedido} avanzó: {hito}. Mira las fotos y el detalle aquí: {enlace}. Embarque estimado: {fecha}.',
  '{nombre}, tu pedido {numero_pedido} ya pasó nuestra verificación en planta. Mira las fotos y el video aquí: {enlace}. Embarque estimado: {fecha}.',
  'Tu pedido {numero_pedido}: {hito}',
  'Tu pedido {numero_pedido} pasó la verificación en planta');

-- Embarque: voz activa.
select pg_temp.revise('order_shipped', 'email',
  '{nombre}, tu pedido {numero_pedido} fue embarcado. Llegada estimada: {fecha}. Detalle y seguimiento: {enlace}.',
  '{nombre}, tu pedido {numero_pedido} ya va en camino. Llegada estimada: {fecha}. Sigue el envío aquí: {enlace}.',
  'Tu pedido {numero_pedido} fue embarcado',
  'Tu pedido {numero_pedido} va en camino');
select pg_temp.revise('order_shipped', 'whatsapp',
  '{nombre}, tu pedido {numero_pedido} fue embarcado. Llegada estimada: {fecha}. Detalle y seguimiento: {enlace}.',
  '{nombre}, tu pedido {numero_pedido} ya va en camino. Llegada estimada: {fecha}. Sigue el envío aquí: {enlace}.');

-- Saldo: {fecha} es la fecha de entrega (igual que en el correo).
select pg_temp.revise('balance_reminder', 'whatsapp',
  '{nombre}, te recordamos el saldo de {monto} de tu pedido {numero_pedido}, con vencimiento el {fecha}. Si ya lo pagaste, envíanos el comprobante por aquí.',
  '{nombre}, te recordamos el saldo de {monto} de tu pedido {numero_pedido}, entregado el {fecha}. Si ya lo pagaste, envíanos el comprobante por aquí.');

-- Encuesta: imperativo con tú.
select pg_temp.revise('nps_survey', 'email',
  '{nombre}, ¿qué tan probable es que nos recomiendes? Cuéntanos en un minuto: {enlace}. Cuando quieras repetir tu pedido, respondes este correo y lo cotizamos.',
  '{nombre}, ¿qué tan probable es que nos recomiendes? Cuéntanos en un minuto: {enlace}. Si quieres repetir tu pedido, responde este correo y lo cotizamos.');
