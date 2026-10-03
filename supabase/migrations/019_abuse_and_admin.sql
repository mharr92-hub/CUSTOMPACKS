-- =============================================================================
-- 019_abuse_and_admin — Abuso anónimo del cotizador y cuenta de
-- administrador (SEG-01, REN-08, SEG-04, SEG-06, SEG-09)
-- =============================================================================

-- Cada URL de subida firmada queda registrada al pedirla: así se puede poner
-- tope a las pendientes por borrador y borrar lo que nunca se confirmó.
create table if not exists public.upload_slots (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  storage_path text not null unique,
  draft_id uuid references public.quote_drafts (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists upload_slots_pending_idx on public.upload_slots (created_at) where confirmed_at is null;
create index if not exists upload_slots_draft_idx on public.upload_slots (draft_id) where confirmed_at is null;
alter table public.upload_slots enable row level security;
revoke all on public.upload_slots from anon, authenticated;

-- "Guardar y seguir después": el enlace solo va al primer correo que se dio
-- para ese borrador (o al del contacto), nunca a cualquier dirección.
alter table public.quote_drafts add column if not exists resume_email text;

-- Las instrucciones de pago solo las ve el cliente con su enlace (el portal
-- las lee en el servidor), no cualquier visitante.
update public.settings set is_public = false where key = 'payment_instructions';

-- Rol de administrador: el correo de admin_email lo recibe solo con el correo
-- confirmado. En Supabase, una cuenta creada por registro público con ese
-- correo no queda como admin hasta confirmar (y el registro público se cierra:
-- docs/deploy.md). En la base local no hay confirmación: cuenta como confirmado.
create or replace function public.email_confirmed(p_user jsonb) returns boolean
language sql immutable as $$
  select not (p_user ? 'email_confirmed_at') or (p_user ->> 'email_confirmed_at') is not null
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin_email text;
  v_role public.app_role := 'client';
begin
  select s.value #>> '{}' into v_admin_email from public.settings s where s.key = 'admin_email';
  if v_admin_email is not null and lower(new.email) = lower(v_admin_email) and public.email_confirmed(to_jsonb(new)) then
    v_role := 'admin';
  elsif coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'sales', 'ops', 'viewer', 'client') then
    v_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  end if;

  insert into public.profiles (user_id, email, name, role, created_by, updated_by)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'name', ''), v_role, new.id, new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Al confirmar el correo de admin_email, la cuenta pasa a admin.
create or replace function public.promote_confirmed_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin_email text;
begin
  if public.email_confirmed(to_jsonb(new)) and not public.email_confirmed(to_jsonb(old)) then
    select s.value #>> '{}' into v_admin_email from public.settings s where s.key = 'admin_email';
    if v_admin_email is not null and lower(new.email) = lower(v_admin_email) then
      update public.profiles set role = 'admin' where user_id = new.id and role = 'client';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update on auth.users
  for each row execute function public.promote_confirmed_admin();
