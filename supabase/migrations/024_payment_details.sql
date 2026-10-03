-- =============================================================================
-- 024_payment_details — Datos de pago estructurados (Bloque 3)
-- =============================================================================
-- Banco, tipo de cuenta, número, beneficiario y correo de comprobantes. Los
-- leen el portal del pedido y el PDF de la cotización. Vacíos y PROVISIONAL
-- hasta que Mark los cargue en Configuración (pregunta 9). No son públicos.
insert into public.settings (key, value, value_type, description, is_public, is_provisional) values
  ('payment_bank_name', '""', 'string', 'Datos de pago: banco donde el cliente transfiere. Se muestra en el portal del pedido y en la cotización PDF.', false, true),
  ('payment_account_type', '""', 'string', 'Datos de pago: tipo de cuenta (corriente o de ahorros).', false, true),
  ('payment_account_number', '""', 'string', 'Datos de pago: número de cuenta.', false, true),
  ('payment_account_holder', '""', 'string', 'Datos de pago: beneficiario (titular de la cuenta, como figura en el banco).', false, true),
  ('payment_receipts_email', '""', 'string', 'Datos de pago: correo al que el cliente puede enviar el comprobante (además de subirlo en su enlace).', false, true)
on conflict (key) do nothing;

update public.settings
   set description = 'Datos de pago: otras instrucciones (Yappy, ACH, qué poner como referencia). Se muestran debajo de los datos de la cuenta. Si no hay cuenta ni instrucciones, el portal ofrece pedirlas por WhatsApp.'
 where key = 'payment_instructions';
