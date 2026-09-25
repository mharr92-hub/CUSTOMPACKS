-- =============================================================================
-- 003_quotes — Solicitudes de cotización (PRD §8, §13, §14)
-- Empresa → Solicitud → Pieza (+ referencias), borradores del wizard,
-- numeración S-AAAA-NNNNN, máquina de estados validada en base y actividades.
-- =============================================================================

create type public.request_status as enum (
  'draft', 'submitted', 'in_review', 'data_pending', 'rfq_sent', 'quoted', 'accepted', 'rejected', 'expired'
);
create type public.traffic_light as enum ('green', 'yellow', 'red');
create type public.request_channel as enum ('web', 'whatsapp', 'email', 'phone', 'other');
create type public.request_segment as enum ('commercial', 'food', 'unsure');
create type public.loss_reason as enum ('price', 'lead_time', 'specification', 'no_response', 'other');
create type public.size_mode as enum ('standard', 'custom', 'by_product');
create type public.print_faces as enum ('outside', 'inside', 'both');
create type public.print_coverage as enum ('logo', 'partial', 'full');
create type public.order_frequency as enum ('once', 'monthly', 'quarterly', 'seasonal');
create type public.product_use as enum ('display', 'shipping', 'delivery', 'event', 'gift');
create type public.artwork_status as enum ('has_artwork', 'no_artwork_yet', 'needs_design', 'not_applicable');
create type public.reference_kind as enum ('photo', 'link', 'gallery_sample');
create type public.activity_channel as enum ('note', 'email', 'whatsapp', 'call', 'system');

-- -----------------------------------------------------------------------------
-- Numeración de documentos: S-AAAA-NNNNN (solicitud), C- (cotización), P- (pedido)
-- Contador por prefijo y año, seguro ante concurrencia (upsert con bloqueo de fila).
-- -----------------------------------------------------------------------------
create table public.document_counters (
  prefix text not null check (prefix ~ '^[A-Z]$'),
  year integer not null,
  last_value integer not null,
  primary key (prefix, year)
);
alter table public.document_counters enable row level security;
revoke all on public.document_counters from anon, authenticated;

create or replace function public.next_document_number(p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_year integer := extract(year from (now() at time zone 'America/Panama'))::integer;
  v_next integer;
begin
  insert into public.document_counters as c (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = c.last_value + 1
  returning c.last_value into v_next;
  return p_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 5, '0');
end;
$$;
revoke execute on function public.next_document_number(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text,
  trade_name text not null,
  ruc text,
  segment public.request_segment,
  country text not null default 'PA',
  city text,
  default_address text,
  lead_source text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index companies_trade_name_idx on public.companies (lower(trade_name));
-- una empresa por RUC (el envío lo guarda normalizado: sin espacios y en mayúsculas)
create unique index companies_ruc_key on public.companies (ruc) where ruc is not null;

alter table public.profiles
  add constraint profiles_company_fk foreign key (company_id) references public.companies (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Solicitudes
-- -----------------------------------------------------------------------------
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^S-\d{4}-\d{5}$'),
  access_token text not null unique check (length(access_token) >= 32),
  status public.request_status not null default 'submitted',
  traffic_light public.traffic_light not null,
  missing_fields text[] not null default '{}',
  channel public.request_channel not null default 'web',
  segment public.request_segment not null,
  company_id uuid references public.companies (id) on delete set null,
  company_name text,
  ruc text,
  contact_name text not null,
  contact_position text,
  contact_email text,
  contact_whatsapp text,
  delivery_city text,
  delivery_address text,
  desired_date date,
  comments text,
  lead_source text,
  needs_advice boolean not null default false,
  utm jsonb not null default '{}'::jsonb,
  referrer text,
  consent_at timestamptz not null,
  consent_ip text,
  assigned_to uuid references auth.users (id) on delete set null,
  loss_reason public.loss_reason,
  loss_note text,
  submitted_at timestamptz not null default now(),
  in_review_at timestamptz,
  data_pending_at timestamptz,
  rfq_sent_at timestamptz,
  quoted_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expired_at timestamptz,
  status_changed_at timestamptz not null default now(),
  draft_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (contact_email is not null or contact_whatsapp is not null),
  check (status <> 'rejected' or loss_reason is not null)
);
create index quote_requests_status_idx on public.quote_requests (status, submitted_at desc);
create index quote_requests_assigned_idx on public.quote_requests (assigned_to);
-- para vincular una solicitud nueva a la empresa de solicitudes anteriores del mismo contacto
create index quote_requests_contact_email_idx on public.quote_requests (contact_email) where contact_email is not null;
create index quote_requests_contact_whatsapp_idx on public.quote_requests (contact_whatsapp) where contact_whatsapp is not null;

-- Historial inmutable de estados (auditoría §13).
create table public.quote_request_status_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  reason text,
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index quote_request_status_log_request_idx on public.quote_request_status_log (request_id, changed_at);

-- Transiciones válidas (PRD §14). lib/states.ts replica esta tabla.
create or replace function public.request_transition_allowed(p_from public.request_status, p_to public.request_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('draft'::public.request_status, 'submitted'::public.request_status),
    ('submitted', 'in_review'),
    ('in_review', 'data_pending'),
    ('data_pending', 'in_review'),
    ('in_review', 'rfq_sent'),
    ('rfq_sent', 'quoted'),
    ('quoted', 'accepted'),
    ('quoted', 'rejected'),
    ('quoted', 'expired'),
    ('expired', 'quoted')
  )
$$;

-- BEFORE: valida la transición y fija los timestamps del estado.
create or replace function public.quote_requests_state_machine() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.status is distinct from old.status then
    if not public.request_transition_allowed(old.status, new.status) then
      raise exception 'Transición no permitida: % → %', old.status, new.status using errcode = '23514';
    end if;
    new.status_changed_at := now();
    case new.status
      when 'in_review' then new.in_review_at := coalesce(new.in_review_at, now());
      when 'data_pending' then new.data_pending_at := now();
      when 'rfq_sent' then new.rfq_sent_at := now();
      when 'quoted' then new.quoted_at := now();
      when 'accepted' then new.accepted_at := now();
      when 'rejected' then new.rejected_at := now();
      when 'expired' then new.expired_at := now();
      else null;
    end case;
  end if;
  return new;
end;
$$;

-- AFTER: registra el historial inmutable (la fila ya existe, así la FK se cumple).
create or replace function public.quote_requests_log_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.quote_request_status_log (request_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.quote_request_status_log (request_id, from_status, to_status, reason, changed_by)
    values (new.id, old.status, new.status, nullif(current_setting('app.transition_reason', true), ''), auth.uid());
  end if;
  return null;
end;
$$;

create trigger quote_requests_audit before insert or update on public.quote_requests
  for each row execute function public.set_audit_fields();
create trigger quote_requests_states before insert or update on public.quote_requests
  for each row execute function public.quote_requests_state_machine();
create trigger quote_requests_status_log after insert or update of status on public.quote_requests
  for each row execute function public.quote_requests_log_status();

-- -----------------------------------------------------------------------------
-- Borradores del wizard (la verdad del progreso; localStorage es solo respaldo)
-- -----------------------------------------------------------------------------
create table public.quote_drafts (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (length(token) >= 32),
  payload jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 262144),
  step integer not null default 0 check (step between 0 and 9),
  contact_email text,
  contact_whatsapp text,
  -- cupo de correos "Guardar y seguir después" (3 cada 24 h por borrador)
  resume_sent_count integer not null default 0,
  resume_window_at timestamptz,
  submitted_request_id uuid references public.quote_requests (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index quote_drafts_expires_idx on public.quote_drafts (expires_at);

alter table public.quote_requests
  add constraint quote_requests_draft_fk foreign key (draft_id) references public.quote_drafts (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Piezas (todos los campos de §13; ids de catálogo + snapshot de nombres/códigos)
-- -----------------------------------------------------------------------------
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  position integer not null check (position >= 1),
  category_id uuid references public.categories (id) on delete set null,
  product_type_id uuid references public.product_types (id) on delete set null,
  needs_advice boolean not null default false,
  size_mode public.size_mode,
  standard_size_id uuid references public.standard_sizes (id) on delete set null,
  length_cm numeric(6, 1) check (length_cm is null or length_cm > 0),
  width_cm numeric(6, 1) check (width_cm is null or width_cm > 0),
  height_cm numeric(6, 1) check (height_cm is null or height_cm > 0),
  paper_id uuid references public.papers (id) on delete set null,
  caliber_id uuid references public.calibers (id) on delete set null,
  eco_attribute_ids uuid[] not null default '{}',
  food_attribute_ids uuid[] not null default '{}',
  print_option_id uuid references public.print_options (id) on delete set null,
  pantone_codes text[] not null default '{}',
  print_faces public.print_faces,
  print_coverage public.print_coverage,
  finish_ids uuid[] not null default '{}',
  product_name text,
  product_contents text,
  product_weight_g numeric(12, 2) check (product_weight_g is null or product_weight_g > 0),
  product_length_cm numeric(6, 1),
  product_width_cm numeric(6, 1),
  product_height_cm numeric(6, 1),
  product_volume text,
  product_conditions public.product_condition[] not null default '{}',
  product_uses public.product_use[] not null default '{}',
  quantities integer[] not null default '{}' check (cardinality(quantities) <= 3 and 0 < all (quantities)),
  frequency public.order_frequency,
  artwork_status public.artwork_status,
  spec_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (request_id, position)
);
create index quote_items_request_idx on public.quote_items (request_id);

-- "references" es palabra reservada en SQL: la tabla se llama quote_references.
create table public.quote_references (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.quote_items (id) on delete cascade,
  kind public.reference_kind not null,
  url text,
  gallery_sample_id uuid references public.gallery_samples (id) on delete set null,
  storage_path text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (kind <> 'link' or url is not null),
  check (kind <> 'gallery_sample' or gallery_sample_id is not null)
);
create index quote_references_item_idx on public.quote_references (item_id);

-- -----------------------------------------------------------------------------
-- Actividades (registro de contactos, notas y eventos del sistema; polimórfica)
-- -----------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.quote_requests (id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  channel public.activity_channel not null default 'system',
  kind text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index activities_request_idx on public.activities (request_id, created_at desc);
create index activities_entity_idx on public.activities (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Auditoría
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'quote_drafts', 'quote_items', 'quote_references', 'activities'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- El cliente (anon) accede a lo suyo solo con el token del enlace seguro, que el
-- servidor fija en app.access_token. El staff ve todo; ventas/operaciones editan.
-- -----------------------------------------------------------------------------
create or replace function public.request_access_token() returns text
language sql stable as $$ select nullif(current_setting('app.access_token', true), '') $$;

alter table public.companies enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_status_log enable row level security;
alter table public.quote_drafts enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_references enable row level security;
alter table public.activities enable row level security;

-- Empresas: solo staff.
revoke all on public.companies from anon;
create policy companies_staff_read on public.companies for select to authenticated using (public.is_staff());
create policy companies_staff_write on public.companies for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());

-- Borradores: solo con su token y vigentes.
create policy quote_drafts_by_token on public.quote_drafts for all to anon, authenticated
  using (token = public.request_access_token() and expires_at > now())
  with check (token = public.request_access_token());

-- Solicitudes.
create policy quote_requests_by_token on public.quote_requests for select to anon, authenticated
  using (access_token = public.request_access_token());
create policy quote_requests_staff_read on public.quote_requests for select to authenticated using (public.is_staff());
create policy quote_requests_staff_insert on public.quote_requests for insert to authenticated with check (public.is_staff_editor());
create policy quote_requests_staff_update on public.quote_requests for update to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());

-- El cliente no ve columnas internas (asignación, semáforo, UTM, IP, motivo de pérdida).
revoke all on public.quote_requests from anon;
grant select (
  id, number, status, segment, company_name, contact_name, contact_email, contact_whatsapp,
  delivery_city, delivery_address, desired_date, comments, needs_advice, submitted_at, in_review_at,
  data_pending_at, rfq_sent_at, quoted_at, accepted_at, rejected_at, expired_at, status_changed_at
) on public.quote_requests to anon;

create policy status_log_read on public.quote_request_status_log for select to anon, authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id));
revoke insert, update, delete on public.quote_request_status_log from anon, authenticated;

-- Piezas y referencias: visibles si la solicitud lo es; escribe el staff.
create policy quote_items_read on public.quote_items for select to anon, authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id));
create policy quote_items_staff_write on public.quote_items for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
revoke insert, update, delete on public.quote_items from anon;

create policy quote_references_read on public.quote_references for select to anon, authenticated
  using (exists (select 1 from public.quote_items i where i.id = item_id));
create policy quote_references_staff_write on public.quote_references for all to authenticated
  using (public.is_staff_editor()) with check (public.is_staff_editor());
revoke insert, update, delete on public.quote_references from anon;

-- Actividades: solo staff; no se editan ni borran (registro).
revoke all on public.activities from anon;
create policy activities_staff_read on public.activities for select to authenticated using (public.is_staff());
create policy activities_staff_insert on public.activities for insert to authenticated with check (public.is_staff_editor());
revoke update, delete on public.activities from authenticated;
