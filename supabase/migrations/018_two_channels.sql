-- =============================================================================
-- 018_two_channels — Cada aviso al cliente por los dos canales y resumen
-- diario de WhatsApp pendientes (PAN-04, FUT-02)
-- =============================================================================

-- Respaldo en el otro canal: según el contacto que dejó, el cliente recibe el
-- aviso por correo o por WhatsApp. Textos PROVISIONAL (los revisa Mark en
-- Panel → Plantillas; al guardarlos dejan de serlo).
insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('quote_expiring', 'email', 'client', 'Recordatorio de vigencia', '3 días y 1 día antes del vencimiento.',
   'Tu cotización {numero_cotizacion} vence el {fecha}',
   '{nombre}, tu cotización {numero_cotizacion} vence el {fecha}. Si quieres aprobarla o ajustar algo, respóndenos o entra a tu enlace de seguimiento.',
   '{nombre,numero_cotizacion,fecha}', true, 41),
  ('order_production', 'email', 'client', 'Producción iniciada', 'Al registrar el inicio de producción.',
   'Tu pedido {numero_pedido} entró en producción',
   '{nombre}, tu pedido {numero_pedido} entró en producción. Entrega estimada: {fecha}. Sigue cada etapa aquí: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 89),
  ('order_milestone', 'email', 'client', 'Hito del pedido (producción, QA, embarque)', 'En cada hito del pedido (E8).',
   'Tu pedido {numero_pedido}: {hito}',
   '{nombre}, tu pedido {numero_pedido} avanzó: {hito}. Mira las fotos y el detalle aquí: {enlace}. Embarque estimado: {fecha}.',
   '{nombre,numero_pedido,hito,enlace,fecha}', true, 91),
  ('order_shipped', 'email', 'client', 'Pedido embarcado', 'Al registrar el embarque.',
   'Tu pedido {numero_pedido} fue embarcado',
   '{nombre}, tu pedido {numero_pedido} fue embarcado. Llegada estimada: {fecha}. Detalle y seguimiento: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 93),
  ('balance_reminder', 'email', 'client', 'Saldo pendiente', '2 y 5 días después de la entrega (E8).',
   'Saldo pendiente de tu pedido {numero_pedido}',
   '{nombre}, te recordamos el saldo de {monto} de tu pedido {numero_pedido}, entregado el {fecha}. Si ya lo pagaste, sube el comprobante en tu enlace de seguimiento o respóndenos con él.',
   '{nombre,numero_pedido,monto,fecha}', true, 111),
  ('deposit_received', 'whatsapp', 'client', 'Anticipo recibido', 'Al registrar el anticipo (E8).', null,
   '{nombre}, recibimos el anticipo de tu pedido {numero_pedido}. Entrega estimada: {fecha}. Sigue cada etapa aquí: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 61),
  ('nps_survey', 'whatsapp', 'client', 'Encuesta y recompra', '7 días después del cierre del pedido (E8).', null,
   '{nombre}, ¿qué tan probable es que nos recomiendes? Cuéntanos en un minuto: {enlace}. Cuando quieras repetir tu pedido, escríbenos por aquí.',
   '{nombre,numero_pedido,enlace}', true, 121),
  ('whatsapp_pending_team', 'email', 'team', 'WhatsApp pendientes (resumen diario)', 'Una vez al día, si hay WhatsApp sin enviar hace más de unas horas hábiles.',
   'WhatsApp pendientes de enviar: {cantidad}',
   'Hay {cantidad} WhatsApp para clientes sin enviar desde hace más de {horas} horas hábiles. Ábrelos y márcalos enviados en {enlace}.' || chr(10) || chr(10) || '{lista}',
   '{cantidad,horas,enlace,lista}', true, 200)
on conflict (code, channel) do nothing;

-- Horas hábiles tras las que un WhatsApp sin enviar entra en el resumen diario.
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('whatsapp_pending_alert_hours', '2', 'number',
        'Horas hábiles tras las que un WhatsApp para el cliente sin enviar entra en el resumen diario al equipo.', false, true)
on conflict (key) do nothing;
