-- =============================================================================
-- 008_orders — Pedidos, hitos con evidencias y checklist de QA, pagos y
-- encuesta (PRD §6, §10, §11, §13, §14)
-- Estados del pedido (§14): Aceptada → Anticipo recibido → En producción
-- (con proof aprobado) → QA en planta → Embarcado → (En aduana) → Entregado
-- → Cerrado (saldo recibido).
-- =============================================================================

create type public.order_status as enum ('pending_deposit', 'deposit_received', 'in_production', 'qa', 'shipped', 'in_customs', 'delivered', 'closed');
create type public.milestone_type as enum (
  'deposit_received', 'artwork_approved', 'production_started', 'qa_completed', 'shipped', 'in_customs', 'delivered', 'balance_received', 'closed'
);
create type public.payment_kind as enum ('deposit', 'balance');
create type public.payment_status as enum ('pending', 'confirmed', 'rejected');

-- Bucket privado de evidencias (fotos, video y PDF de cada hito).
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 209715200)
on conflict (id) do nothing;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  quote_id uuid not null unique references public.quotes (id) on delete restrict,
  request_id uuid not null references public.quote_requests (id) on delete restrict,
  status public.order_status not null default 'pending_deposit',
  -- interno: [{ item_id, position, quantity, unit_price, subtotal, lead_time_days }]
  lines jsonb not null default '[]'::jsonb,
  currency text not null default 'USD',
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  deposit_pct integer not null check (deposit_pct between 0 and 100),
  deposit_amount numeric(14, 2) not null check (deposit_amount >= 0),
  balance_amount numeric(14, 2) not null check (balance_amount >= 0),
  lead_time_days integer not null check (lead_time_days between 1 and 365),
  lead_time_start date,
  estimated_delivery_date date,
  delivery_address text,
  delivery_city text,
  transport text,
  tracking text,
  eta date,
  notes text,
  delivered_at timestamptz,
  closed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index orders_status_idx on public.orders (status, estimated_delivery_date);
create index orders_request_idx on public.orders (request_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  type public.milestone_type not null,
  occurred_at timestamptz not null default now(),
  responsible uuid references auth.users (id) on delete set null,
  notes text,
  -- [{ path, kind, name, size }]
  evidence jsonb not null default '[]'::jsonb,
  -- [{ key, label, expected, result, comment }]
  qa_checklist jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index milestones_order_idx on public.milestones (order_id, occurred_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind public.payment_kind not null,
  status public.payment_status not null default 'pending',
  amount numeric(14, 2) check (amount is null or amount > 0),
  currency text not null default 'USD',
  method text,
  reference text,
  receipt_path text,
  paid_on date,
  uploaded_by_client boolean not null default false,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (status <> 'confirmed' or (amount is not null and confirmed_at is not null))
);
create index payments_order_idx on public.payments (order_id, kind);

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  score integer not null check (score between 0 and 10),
  comment text,
  ip text,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'milestones', 'payments'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit_log', t);
  end loop;
end
$$;

-- Un pedido cambia de estado solo por los pasos de §14.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('pending_deposit'::public.order_status, 'deposit_received'::public.order_status),
    ('deposit_received', 'in_production'),
    ('in_production', 'qa'),
    ('qa', 'shipped'),
    ('shipped', 'in_customs'),
    ('shipped', 'delivered'),
    ('in_customs', 'delivered'),
    ('delivered', 'closed')
  )
$$;

create or replace function public.orders_state_machine() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'Transición de pedido no permitida: % → %', old.status, new.status using errcode = '23514';
    end if;
    new.status_changed_at := now();
    if new.status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
    if new.status = 'closed' then new.closed_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger orders_state_machine before update on public.orders
  for each row execute function public.orders_state_machine();

-- -----------------------------------------------------------------------------
-- RLS: el equipo ve y opera; el cliente, con su enlace, ve su pedido sin montos
-- (los montos van en el PDF de estado de pagos, D-078).
-- -----------------------------------------------------------------------------
alter table public.orders enable row level security;
alter table public.milestones enable row level security;
alter table public.payments enable row level security;
alter table public.surveys enable row level security;

create policy orders_read on public.orders for select to anon, authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id));
create policy orders_staff_write on public.orders for update to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
revoke all on public.orders from anon;
grant select (id, number, request_id, status, estimated_delivery_date, delivery_city, transport, tracking, eta, delivered_at, closed_at, created_at)
  on public.orders to anon;
revoke insert, delete on public.orders from authenticated;

create policy milestones_read on public.milestones for select to anon, authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy milestones_staff_write on public.milestones for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
revoke all on public.milestones from anon;
grant select (id, order_id, type, occurred_at, notes, evidence, qa_checklist) on public.milestones to anon;

create policy payments_read on public.payments for select to anon, authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy payments_staff_write on public.payments for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
revoke all on public.payments from anon;
grant select (id, order_id, kind, status, paid_on, uploaded_by_client, created_at) on public.payments to anon;

create policy surveys_staff_read on public.surveys for select to authenticated using (public.is_staff());
revoke all on public.surveys from anon;
revoke insert, update, delete on public.surveys from authenticated;

-- Plantillas de hitos que el PRD no redacta (PROVISIONAL).
insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('order_production', 'whatsapp', 'client', 'Producción iniciada', 'Al registrar el inicio de producción.', null,
   '{nombre}, tu pedido {numero_pedido} entró en producción. Entrega estimada: {fecha}. Sigue cada etapa aquí: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 88),
  ('order_shipped', 'whatsapp', 'client', 'Pedido embarcado', 'Al registrar el embarque.', null,
   '{nombre}, tu pedido {numero_pedido} fue embarcado. Llegada estimada: {fecha}. Detalle y seguimiento: {enlace}.',
   '{nombre,numero_pedido,fecha,enlace}', true, 92),
  ('receipt_uploaded_team', 'email', 'team', 'Comprobante de pago recibido (equipo)', 'El cliente subió un comprobante desde su enlace.',
   'Comprobante de pago · {numero_pedido}',
   '{empresa} subió un comprobante de pago del pedido {numero_pedido}. Confírmalo en el panel: {enlace_panel}.',
   '{empresa,numero_pedido,enlace_panel}', true, 65)
on conflict (code, channel) do nothing;

-- Datos de pago que el cliente ve con su enlace (sin datos inventados: lo completa admin).
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('payment_instructions', '""', 'string', 'Instrucciones de pago que ve el cliente en su pedido (banco, cuenta, Yappy…). Vacío: se le pide escribir por WhatsApp.', true, true)
on conflict (key) do nothing;

-- El pedido ahora se crea solo al aceptar: se ajusta el aviso al equipo (si no se editó).
update public.message_templates
   set body = 'El cliente de {empresa} aceptó la cotización de la solicitud {numero}. El pedido ya está creado: solicita el anticipo y revisa el arte: {enlace_panel}.'
 where code = 'quote_accepted_team' and channel = 'email'
   and body = 'El cliente de {empresa} aceptó la cotización de la solicitud {numero}. Crea el pedido y solicita el anticipo: {enlace_panel}.';
