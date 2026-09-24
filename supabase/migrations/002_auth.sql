-- =============================================================================
-- 002_auth — Perfiles, roles y permisos del equipo (PRD §11 Roles)
-- =============================================================================

create type public.app_role as enum ('admin', 'sales', 'ops', 'viewer', 'client');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text,
  name text,
  position text,
  role public.app_role not null default 'client',
  company_id uuid, -- FK a companies en 003_quotes
  whatsapp text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_audit before insert or update on public.profiles
  for each row execute function public.set_audit_fields();

-- -----------------------------------------------------------------------------
-- Funciones de rol (security definer: leen profiles sin depender de RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.user_id = auth.uid() and p.is_active
$$;

create or replace function public.has_role(variadic roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.role = any (roles) from public.profiles p where p.user_id = auth.uid() and p.is_active),
    false
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin', 'sales', 'ops', 'viewer')
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin')
$$;

-- Staff que puede modificar datos operativos (todos menos viewer).
create or replace function public.is_staff_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin', 'sales', 'ops')
$$;

-- -----------------------------------------------------------------------------
-- Alta automática de perfil. El correo de settings.admin_email recibe rol
-- admin; un rol en raw_app_meta_data (solo lo fija el servicio al invitar) se
-- respeta; el resto entra como client.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin_email text;
  v_role public.app_role := 'client';
begin
  select s.value #>> '{}' into v_admin_email from public.settings s where s.key = 'admin_email';
  if v_admin_email is not null and lower(new.email) = lower(v_admin_email) then
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Nadie cambia su propio rol ni se deja el sistema sin administradores.
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el usuario de un perfil' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles o desactivar usuarios' using errcode = '42501';
  end if;
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active) then
    if not exists (
      select 1 from public.profiles p
       where p.role = 'admin' and p.is_active and p.id <> old.id
    ) then
      raise exception 'Debe quedar al menos un administrador activo' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- -----------------------------------------------------------------------------
-- RLS de profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

create policy profiles_read_own_or_staff on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Catálogo y configuración: el staff lee todo (también lo inactivo) y solo
-- admin escribe.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'product_types', 'standard_sizes', 'papers', 'calibers', 'print_options',
    'finishes', 'eco_attributes', 'food_attributes', 'compatibilities', 'gallery_samples',
    'settings', 'message_templates'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
  end loop;
end
$$;
