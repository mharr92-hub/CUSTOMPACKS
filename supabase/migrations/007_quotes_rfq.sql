-- =============================================================================
-- 007_quotes_rfq — RFQ a fábrica y cotización formal (PRD §11, §13, §14)
-- Costos y márgenes son internos: el cliente nunca los lee (permisos por
-- columna) y los precios solo viajan en el PDF de la cotización.
-- =============================================================================

create type public.quote_status as enum ('draft', 'sent', 'changes_requested', 'accepted', 'rejected', 'expired', 'superseded');

-- Bucket privado para documentos generados (RFQ, cotizaciones, actas).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- RFQ a fábrica
-- -----------------------------------------------------------------------------
create table public.factory_rfqs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  version integer not null check (version >= 1),
  pdf_path text,
  xlsx_path text,
  sent_at timestamptz,
  sent_to text,
  responded_at timestamptz,
  -- [{ item_id, quantity, unit_cost }]
  costs jsonb not null default '[]'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  production_days integer check (production_days is null or production_days between 1 and 365),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (request_id, version)
);
create index factory_rfqs_request_idx on public.factory_rfqs (request_id, version desc);
create trigger factory_rfqs_audit before insert or update on public.factory_rfqs
  for each row execute function public.set_audit_fields();
create trigger factory_rfqs_audit_log after insert or update or delete on public.factory_rfqs
  for each row execute function public.audit_row();

alter table public.factory_rfqs enable row level security;
revoke all on public.factory_rfqs from anon;
create policy factory_rfqs_staff_read on public.factory_rfqs for select to authenticated using (public.is_staff());
create policy factory_rfqs_staff_write on public.factory_rfqs for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());

-- -----------------------------------------------------------------------------
-- Cotizaciones: número C-AAAA-NNNNN-vN; una versión nueva reemplaza a la anterior.
-- -----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  rfq_id uuid references public.factory_rfqs (id) on delete set null,
  base_number text not null,
  version integer not null check (version >= 1),
  number text not null unique,
  status public.quote_status not null default 'draft',
  -- interno: [{ item_id, position, quantity, unit_cost, freight_total, margin_pct, unit_price, subtotal, lead_time_days }]
  lines jsonb not null default '[]'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  deposit_pct integer not null default 50 check (deposit_pct between 0 and 100),
  valid_until date not null,
  notes text,
  pdf_path text,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_by_email text,
  accepted_ip text,
  accepted_user_agent text,
  -- cantidades elegidas por el cliente al aceptar: [{ item_id, quantity }]
  accepted_selection jsonb,
  changes_requested_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (base_number, version)
);
create index quotes_request_idx on public.quotes (request_id, version desc);
create index quotes_sent_idx on public.quotes (valid_until) where status = 'sent';
create trigger quotes_audit before insert or update on public.quotes
  for each row execute function public.set_audit_fields();
create trigger quotes_audit_log after insert or update or delete on public.quotes
  for each row execute function public.audit_row();

-- La aceptación del cliente no se reescribe.
create or replace function public.quotes_guard_acceptance() returns trigger
language plpgsql as $$
begin
  if old.accepted_at is not null and (new.accepted_at is distinct from old.accepted_at or new.accepted_selection is distinct from old.accepted_selection) then
    raise exception 'La aceptación de la cotización es inmutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger quotes_guard_acceptance before update on public.quotes
  for each row execute function public.quotes_guard_acceptance();

alter table public.quotes enable row level security;
create policy quotes_by_token on public.quotes for select to anon, authenticated
  using (status <> 'draft' and exists (select 1 from public.quote_requests r where r.id = request_id));
create policy quotes_staff_read on public.quotes for select to authenticated using (public.is_staff());
create policy quotes_staff_write on public.quotes for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
-- El cliente no lee costos, márgenes ni precios (los precios van solo en el PDF).
revoke all on public.quotes from anon;
grant select (id, request_id, number, version, status, currency, deposit_pct, valid_until, sent_at, accepted_at, accepted_by_name, accepted_selection, changes_requested_at)
  on public.quotes to anon;

-- Al cerrar la solicitud (rechazada o vencida), la cotización vigente acompaña.
create or replace function public.sync_quote_with_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('rejected', 'expired') then
    update public.quotes set status = new.status::text::public.quote_status
     where request_id = new.id and status in ('sent', 'changes_requested');
  end if;
  return null;
end;
$$;
create trigger quote_requests_sync_quote after update of status on public.quote_requests
  for each row execute function public.sync_quote_with_request();

-- "Cotización enviada" se encola desde el servidor al emitir cada versión (con sus datos);
-- el paso a Cotizada ya no la encola (evita el doble aviso en la v1).
create or replace function public.notify_request_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_event text := case new.to_status
    when 'submitted' then 'request_submitted'
    when 'data_pending' then 'data_missing'
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

-- Plantilla: el cliente pide cambios a la cotización.
insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('quote_changes_team', 'email', 'team', 'Cambios pedidos a la cotización (equipo)', 'El cliente pidió cambios desde su enlace.',
   'Cambios pedidos · {numero_cotizacion}',
   '{empresa} pidió cambios a la cotización {numero_cotizacion}: "{respuesta}". Prepara una nueva versión: {enlace_panel}.',
   '{numero_cotizacion,empresa,respuesta,enlace_panel}', true, 45)
on conflict (code, channel) do nothing;
