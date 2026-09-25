-- =============================================================================
-- 005_notifications — Notificaciones por evento (PRD §12) y plantillas (§21-C)
-- Los cambios de estado encolan mensajes en `notifications` desde la base (no
-- se escapa ninguno aunque el cambio venga de otro camino); el servidor los
-- redacta con la plantilla vigente, los envía (o simula) y los registra.
-- =============================================================================

create type public.notification_status as enum ('queued', 'sent', 'simulated', 'failed');

-- Plantillas: a quién va cada una (cliente o equipo).
alter table public.message_templates
  add column audience text not null default 'client' check (audience in ('client', 'team'));

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  template_code text not null,
  request_id uuid references public.quote_requests (id) on delete cascade,
  entity_type text,
  entity_id uuid,
  audience text not null check (audience in ('client', 'team')),
  channel public.message_channel not null,
  recipient text not null,
  status public.notification_status not null default 'queued',
  subject text,
  body text,
  wa_link text,
  error text,
  payload jsonb not null default '{}'::jsonb,
  -- evita duplicados (p. ej. el mismo recordatorio dos veces)
  dedupe_key text unique,
  attempts integer not null default 0,
  -- mientras un proceso la está enviando (evita dobles envíos)
  locked_until timestamptz,
  sent_at timestamptz,
  -- WhatsApp click-to-chat: el equipo lo abre y lo marca enviado
  manual_sent_by uuid references auth.users (id) on delete set null,
  manual_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_queue_idx on public.notifications (created_at) where status = 'queued';
create index notifications_request_idx on public.notifications (request_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
create policy notifications_staff_read on public.notifications for select to authenticated using (public.is_staff());
-- El equipo solo marca a mano el envío por WhatsApp (el resto lo escribe el servidor).
create policy notifications_staff_mark on public.notifications for update to authenticated
  using (public.is_staff_editor() and channel = 'whatsapp') with check (public.is_staff_editor() and channel = 'whatsapp');
revoke insert, delete on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (manual_sent_by, manual_sent_at, status, updated_at) on public.notifications to authenticated;

-- Corridas de procesos programados (para no repetirlos más seguido de lo debido).
create table public.job_runs (
  name text primary key,
  last_run_at timestamptz not null default now()
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Encolar: una fila por plantilla activa del evento (cliente y/o equipo, por
-- correo y/o WhatsApp). Sin destinatario (p. ej. sin correo) no se encola.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_notifications(
  p_event text,
  p_request_id uuid,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  v_email text;
  v_whatsapp text;
  v_team text;
  v_recipient text;
  v_count integer := 0;
begin
  if p_request_id is not null then
    select contact_email, contact_whatsapp into v_email, v_whatsapp from public.quote_requests where id = p_request_id;
  end if;
  select coalesce(
           (select nullif(value #>> '{}', '') from public.settings where key = 'team_notification_email'),
           (select nullif(value #>> '{}', '') from public.settings where key = 'admin_email'))
    into v_team;
  for t in
    select code, channel, audience from public.message_templates
     where is_active and (code = p_event or code = p_event || '_team')
     order by audience, channel
  loop
    v_recipient := case
      when t.audience = 'team' then case when t.channel = 'email' then v_team end
      when t.channel = 'email' then v_email
      else v_whatsapp
    end;
    continue when v_recipient is null;
    insert into public.notifications (event, template_code, request_id, entity_type, entity_id, audience, channel, recipient, payload, dedupe_key)
    values (p_event, t.code, p_request_id, p_entity_type, p_entity_id, t.audience, t.channel, v_recipient, coalesce(p_payload, '{}'::jsonb),
            case when p_dedupe is null then null else p_dedupe || ':' || t.code || ':' || t.channel end)
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.enqueue_notifications(text, uuid, text, uuid, jsonb, text) from public, anon, authenticated;

-- Estados de la solicitud que notifican (§12).
create or replace function public.notify_request_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event text := case new.to_status
    when 'submitted' then 'request_submitted'
    when 'data_pending' then 'data_missing'
    when 'quoted' then 'quote_sent'
    when 'accepted' then 'quote_accepted'
  end;
begin
  if v_event is not null then
    perform public.enqueue_notifications(v_event, new.request_id, 'quote_request', new.request_id,
      jsonb_build_object('reason', new.reason), 'status:' || new.id::text);
  end if;
  return new;
end;
$$;
create trigger quote_request_status_notify after insert on public.quote_request_status_log
  for each row execute function public.notify_request_status();

-- Arte observado y proof listo (§12 "Proof listo / arte observado").
create or replace function public.notify_artwork() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'artwork' and new.status = 'observed' and (tg_op = 'INSERT' or old.status is distinct from 'observed') then
    perform public.enqueue_notifications('artwork_observed', new.request_id, 'artwork_file', new.id,
      jsonb_build_object('item_id', new.item_id, 'version', new.version), 'artwork_observed:' || new.id::text || ':' || coalesce(new.reviewed_at, now())::text);
  elsif new.kind = 'proof' and new.status = 'proof_sent' and tg_op = 'INSERT' then
    perform public.enqueue_notifications('proof_ready', new.request_id, 'artwork_file', new.id,
      jsonb_build_object('item_id', new.item_id, 'version', new.version), 'proof_ready:' || new.id::text);
  end if;
  return new;
end;
$$;
create trigger artwork_files_notify after insert or update of status on public.artwork_files
  for each row execute function public.notify_artwork();

-- -----------------------------------------------------------------------------
-- Plantillas (§21-C). Las que no trae el PRD van como PROVISIONAL.
-- Variables entre llaves; {enlace} es siempre un enlace generado por el sistema.
-- -----------------------------------------------------------------------------
insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('request_submitted', 'email', 'client', 'Solicitud recibida', 'Al enviar el cotizador.',
   'Recibimos tu solicitud {numero}',
   'Hola {nombre}, recibimos tu solicitud {numero} para {pieza}. Te enviamos la cotización en un máximo de 24 horas hábiles. Sigue el estado aquí: {enlace}.',
   '{nombre,numero,pieza,enlace}', false, 10),
  ('request_submitted', 'whatsapp', 'client', 'Solicitud recibida', 'Al enviar el cotizador.', null,
   'Hola {nombre}, recibimos tu solicitud {numero} para {pieza}. Te enviamos la cotización en un máximo de 24 horas hábiles. Sigue el estado aquí: {enlace}.',
   '{nombre,numero,pieza,enlace}', false, 11),
  ('request_submitted_team', 'email', 'team', 'Nueva solicitud (equipo)', 'Aviso al equipo de cada solicitud nueva.',
   'Nueva solicitud {numero} · {semaforo}',
   'Entró la solicitud {numero} de {empresa} ({segmento}) para {pieza}. Semáforo: {semaforo}. Ábrela en el panel: {enlace_panel}.',
   '{numero,empresa,segmento,pieza,semaforo,enlace_panel}', true, 12),
  ('data_missing', 'email', 'client', 'Datos faltantes', 'Al pasar la solicitud a "Datos pendientes".',
   'Nos faltan datos para cotizar {numero}',
   '{nombre}, para cotizar {numero} nos falta: {lista}. Puedes completarlo aquí: {enlace}. Si prefieres, responde este mensaje y lo cargamos por ti.',
   '{nombre,numero,lista,enlace}', false, 20),
  ('data_missing', 'whatsapp', 'client', 'Datos faltantes', 'Al pasar la solicitud a "Datos pendientes".', null,
   '{nombre}, para cotizar {numero} nos falta: {lista}. Puedes completarlo aquí: {enlace}. Si prefieres, responde este mensaje y lo cargamos por ti.',
   '{nombre,numero,lista,enlace}', false, 21),
  ('quote_sent', 'email', 'client', 'Cotización enviada', 'Al enviar la cotización (E7).',
   'Tu cotización {numero_cotizacion} está lista',
   '{nombre}, tu cotización {numero_cotizacion} está lista: {enlace}. Vigencia hasta {fecha}. Condiciones: {anticipo} % al aprobar, {saldo} % al recibir; entrega en {plazo} días.',
   '{nombre,numero_cotizacion,enlace,fecha,anticipo,saldo,plazo}', false, 30),
  ('quote_sent', 'whatsapp', 'client', 'Cotización enviada', 'Al enviar la cotización (E7).', null,
   '{nombre}, tu cotización {numero_cotizacion} está lista: {enlace}. Vigencia hasta {fecha}. Condiciones: {anticipo} % al aprobar, {saldo} % al recibir; entrega en {plazo} días.',
   '{nombre,numero_cotizacion,enlace,fecha,anticipo,saldo,plazo}', false, 31),
  ('quote_expiring', 'whatsapp', 'client', 'Recordatorio de vigencia', '3 días y 1 día antes del vencimiento.', null,
   '{nombre}, tu cotización {numero_cotizacion} vence el {fecha}. ¿La aprobamos o ajustamos algo?',
   '{nombre,numero_cotizacion,fecha}', false, 40),
  ('quote_accepted_team', 'email', 'team', 'Cotización aceptada (equipo)', 'Crear el pedido y pedir el anticipo.',
   'Cotización aceptada · {numero}',
   'El cliente de {empresa} aceptó la cotización de la solicitud {numero}. Crea el pedido y solicita el anticipo: {enlace_panel}.',
   '{numero,empresa,enlace_panel}', true, 50),
  ('deposit_received', 'email', 'client', 'Anticipo recibido', 'Al registrar el anticipo (E8).',
   'Recibimos tu anticipo · pedido {numero_pedido}',
   '{nombre}, recibimos el anticipo de tu pedido {numero_pedido}. Entrega estimada: {fecha}. Sigue cada etapa aquí: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 60),
  ('artwork_observed', 'email', 'client', 'Arte con observaciones', 'Cuando el equipo pide correcciones del arte.',
   'Tu arte de {numero} necesita un ajuste',
   '{nombre}, revisamos el arte de {pieza} ({numero}) y encontramos puntos a corregir. Mira los comentarios y sube la versión corregida aquí: {enlace}.',
   '{nombre,numero,pieza,enlace}', true, 70),
  ('artwork_observed', 'whatsapp', 'client', 'Arte con observaciones', 'Cuando el equipo pide correcciones del arte.', null,
   '{nombre}, revisamos el arte de {pieza} ({numero}) y encontramos puntos a corregir. Mira los comentarios y sube la versión corregida aquí: {enlace}.',
   '{nombre,numero,pieza,enlace}', true, 71),
  ('proof_ready', 'email', 'client', 'Proof listo', 'Cuando el equipo sube el proof.',
   'Tu proof de {numero} está listo para aprobar',
   '{nombre}, el proof de {pieza} ({numero}) está listo. Revísalo y apruébalo aquí: {enlace}. Sin tu aprobación no pasamos a producción.',
   '{nombre,numero,pieza,enlace}', true, 80),
  ('proof_ready', 'whatsapp', 'client', 'Proof listo', 'Cuando el equipo sube el proof.', null,
   '{nombre}, el proof de {pieza} ({numero}) está listo. Revísalo y apruébalo aquí: {enlace}. Sin tu aprobación no pasamos a producción.',
   '{nombre,numero,pieza,enlace}', true, 81),
  ('order_milestone', 'whatsapp', 'client', 'Hito del pedido (producción, QA, embarque)', 'En cada hito del pedido (E8).', null,
   '{nombre}, tu pedido {numero_pedido} ya pasó nuestra verificación en planta. Mira las fotos y el video: {enlace}. Embarque estimado: {fecha}.',
   '{nombre,numero_pedido,hito,enlace,fecha}', false, 90),
  ('order_delivered', 'email', 'client', 'Entregado y saldo', 'Al marcar el pedido como entregado (E8).',
   'Pedido {numero_pedido} entregado',
   '{nombre}, tu pedido {numero_pedido} fue entregado hoy. El saldo de {monto} vence el {fecha}. Gracias por confiar en nosotros.',
   '{nombre,numero_pedido,monto,fecha}', false, 100),
  ('order_delivered', 'whatsapp', 'client', 'Entregado y saldo', 'Al marcar el pedido como entregado (E8).', null,
   '{nombre}, tu pedido {numero_pedido} fue entregado hoy. El saldo de {monto} vence el {fecha}. Gracias por confiar en nosotros.',
   '{nombre,numero_pedido,monto,fecha}', false, 101),
  ('balance_reminder', 'whatsapp', 'client', 'Saldo pendiente', '2 y 5 días después de la entrega (E8).', null,
   '{nombre}, te recordamos el saldo de {monto} de tu pedido {numero_pedido}, con vencimiento el {fecha}. Si ya lo pagaste, envíanos el comprobante por aquí.',
   '{nombre,numero_pedido,monto,fecha}', true, 110),
  ('nps_survey', 'email', 'client', 'Encuesta y recompra', '7 días después del cierre del pedido (E8).',
   '¿Cómo te fue con tu pedido {numero_pedido}?',
   '{nombre}, ¿qué tan probable es que nos recomiendes? Cuéntanos en un minuto: {enlace}. Cuando quieras repetir tu pedido, respondes este correo y lo cotizamos.',
   '{nombre,numero_pedido,enlace}', true, 120),
  ('sla_overdue_team', 'email', 'team', 'SLA vencido (equipo)', 'Solicitud sin respuesta en 4 h hábiles o sin cotizar en 24 h.',
   'SLA vencido · {numero}',
   'La solicitud {numero} de {empresa} lleva {horas} horas hábiles sin {tarea}. Ábrela aquí: {enlace_panel}.',
   '{numero,empresa,horas,tarea,enlace_panel}', true, 130)
on conflict (code, channel) do nothing;

-- Correo del equipo para avisos internos (por defecto, el de admin).
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('team_notification_email', '""', 'string', 'Correo que recibe los avisos internos (solicitud nueva, cotización aceptada, SLA). Vacío: el correo de admin.', false, true)
on conflict (key) do nothing;
