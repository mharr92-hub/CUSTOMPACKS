-- =============================================================================
-- 004_artwork — Arte, versiones, checklist de preprensa y proof (PRD §9)
-- Ningún arte viaja a fábrica sin checklist y sin proof aprobado por el
-- cliente con fecha, hora, usuario e IP (registro inmutable).
-- =============================================================================

create type public.artwork_file_status as enum (
  'received', 'in_review', 'observed', 'approved_for_proof', 'proof_sent', 'proof_approved', 'released'
);
create type public.artwork_file_kind as enum ('artwork', 'proof');

create table public.artwork_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.quote_items (id) on delete cascade,
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  kind public.artwork_file_kind not null default 'artwork',
  version integer not null check (version >= 1),
  storage_path text not null unique,
  file_name text not null,
  format text not null check (format in ('pdf', 'ai', 'eps', 'svg', 'png', 'jpeg', 'webp')),
  size_bytes bigint not null check (size_bytes > 0),
  status public.artwork_file_status not null default 'received',
  checklist jsonb not null default '{}'::jsonb,
  comments text,
  uploaded_by_client boolean not null default true,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  client_approved_at timestamptz,
  -- retención (§9): el cron marca; el archivo solo se borra cuando admin lo confirma
  retention_flagged_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (item_id, kind, version)
);
create index artwork_files_item_idx on public.artwork_files (item_id, kind, version desc);
create index artwork_files_request_idx on public.artwork_files (request_id);

create trigger artwork_files_audit before insert or update on public.artwork_files
  for each row execute function public.set_audit_fields();

-- Aprobación del proof por el cliente: registro de solo inserción.
create table public.artwork_approvals (
  id uuid primary key default gen_random_uuid(),
  artwork_file_id uuid not null unique references public.artwork_files (id) on delete restrict,
  request_id uuid not null references public.quote_requests (id) on delete restrict,
  approved_at timestamptz not null default now(),
  approved_by_name text not null,
  approved_by_email text,
  approved_by_user uuid references auth.users (id) on delete set null,
  ip text,
  user_agent text
);

create or replace function public.forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'Registro inmutable: % no admite %', tg_table_name, tg_op using errcode = '42501';
end;
$$;

create trigger artwork_approvals_immutable before update or delete on public.artwork_approvals
  for each row execute function public.forbid_change();

-- Al registrar la aprobación, el proof pasa a proof_approved con la misma marca de tiempo.
create or replace function public.artwork_on_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.artwork_files
     where id = new.artwork_file_id and kind = 'proof' and status = 'proof_sent' and deleted_at is null
  ) then
    raise exception 'Solo se aprueba un proof enviado' using errcode = '23514';
  end if;
  update public.artwork_files
     set status = 'proof_approved', client_approved_at = new.approved_at
   where id = new.artwork_file_id;
  return new;
end;
$$;
create trigger artwork_approvals_apply after insert on public.artwork_approvals
  for each row execute function public.artwork_on_approval();

-- La fecha de aprobación del cliente no se puede reescribir.
create or replace function public.artwork_guard_approval() returns trigger
language plpgsql as $$
begin
  if old.client_approved_at is not null and new.client_approved_at is distinct from old.client_approved_at then
    raise exception 'La aprobación del proof es inmutable' using errcode = '42501';
  end if;
  -- "Proof aprobado" solo existe si el cliente lo aprobó (registro en artwork_approvals).
  if new.status = 'proof_approved' and old.status is distinct from 'proof_approved'
     and not exists (select 1 from public.artwork_approvals a where a.artwork_file_id = new.id) then
    raise exception 'Solo el cliente aprueba el proof' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger artwork_files_guard_approval before update on public.artwork_files
  for each row execute function public.artwork_guard_approval();

-- -----------------------------------------------------------------------------
-- Archivos subidos a un borrador del cotizador (antes de enviar). Solo el
-- servidor escribe aquí, después de verificar el tipo real del archivo; al
-- enviar la solicitud se registran como arte o foto de referencia.
-- -----------------------------------------------------------------------------
create table public.quote_draft_files (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.quote_drafts (id) on delete cascade,
  item_key text not null check (item_key ~ '^[A-Za-z0-9_-]{1,64}$'),
  purpose text not null check (purpose in ('artwork', 'reference')),
  storage_path text not null unique,
  file_name text not null,
  format text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index quote_draft_files_draft_idx on public.quote_draft_files (draft_id, item_key);
alter table public.quote_draft_files enable row level security;
revoke all on public.quote_draft_files from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Bucket privado. Nadie accede directo: el servidor firma URLs de corta
-- duración solo para el cliente (con su enlace), el staff asignado y admin.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('artwork', 'artwork', false, 104857600)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- Staff asignado a la solicitud o admin (PRD: "solo lo abren el cliente, el
-- equipo asignado y admin").
create or replace function public.can_access_request_files(p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (
        select 1 from public.quote_requests r
         where r.id = p_request_id and r.assigned_to = auth.uid() and public.is_staff()
      )
$$;

alter table public.artwork_files enable row level security;
alter table public.artwork_approvals enable row level security;

-- Visible si la solicitud lo es: el cliente con su enlace y todo el equipo
-- (la bandeja muestra que hay archivos). Abrirlos y revisarlos es solo para el
-- equipo asignado y admin: el servidor firma URLs tras comprobarlo.
create policy artwork_files_read on public.artwork_files for select to anon, authenticated
  using (exists (select 1 from public.quote_requests r where r.id = request_id));
create policy artwork_files_staff_write on public.artwork_files for update to authenticated
  using (public.is_staff_editor() and public.can_access_request_files(request_id))
  with check (public.is_staff_editor() and public.can_access_request_files(request_id));
revoke insert, delete on public.artwork_files from authenticated;
-- El cliente no ve columnas internas (revisor, retención, borrado).
revoke all on public.artwork_files from anon;
grant select (
  id, item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, checklist, comments,
  client_approved_at, deleted_at, created_at
) on public.artwork_files to anon;

create policy artwork_approvals_read on public.artwork_approvals for select to anon, authenticated
  using (exists (select 1 from public.artwork_files f where f.id = artwork_file_id));
revoke all on public.artwork_approvals from anon;
grant select (id, artwork_file_id, request_id, approved_at, approved_by_name) on public.artwork_approvals to anon;
revoke insert, update, delete on public.artwork_approvals from authenticated;
