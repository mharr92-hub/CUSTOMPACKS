-- =============================================================================
-- 001_master_data — Catálogo y datos maestros (PRD §7, §13)
-- Todas las opciones del cotizador viven aquí y se referencian por código.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.segment as enum ('commercial', 'food');
create type public.product_condition as enum ('hot', 'cold', 'grease', 'fragile', 'liquid');
create type public.size_family as enum ('box', 'bag', 'food_box');
create type public.setting_type as enum ('number', 'string', 'boolean', 'json');
create type public.message_channel as enum ('email', 'whatsapp');

-- -----------------------------------------------------------------------------
-- Auditoría: created_* / updated_* en toda tabla
-- -----------------------------------------------------------------------------
create or replace function public.set_audit_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tablas de catálogo (columnas comunes + específicas)
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  photo_url text,
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  photo_url text,
  photos text[] not null default '{}',
  category_id uuid not null references public.categories (id) on delete restrict,
  segments public.segment[] not null default '{commercial,food}',
  size_family public.size_family not null default 'box',
  typical_uses text[] not null default '{}',
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index product_types_category_idx on public.product_types (category_id);

create table public.standard_sizes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  family public.size_family not null,
  length_cm numeric(6, 1) not null check (length_cm > 0),
  width_cm numeric(6, 1) not null check (width_cm > 0),
  height_cm numeric(6, 1) not null check (height_cm > 0),
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index standard_sizes_family_idx on public.standard_sizes (family);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  is_barrier boolean not null default false,
  suggested_for_conditions public.product_condition[] not null default '{}',
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.calibers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  grammage_gsm numeric(6, 1),
  points numeric(6, 1),
  simple_label text,
  min_weight_g integer check (min_weight_g is null or min_weight_g >= 0),
  max_weight_g integer check (max_weight_g is null or max_weight_g > 0),
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (min_weight_g is null or max_weight_g is null or min_weight_g < max_weight_g)
);

create table public.print_options (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  ink_count integer check (ink_count is null or ink_count >= 0),
  requires_pantone boolean not null default false,
  is_no_print boolean not null default false,
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.finishes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default true,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.eco_attributes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  show_badge boolean not null default false,
  certificate_url text,
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default false,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.food_attributes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  photo_url text,
  suggested_for_conditions public.product_condition[] not null default '{}',
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default false,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Reglas tipo × papel × calibre. Una fila con allowed=true convierte a ese
-- papel (o calibre) en lista blanca para el tipo; allowed=false lo excluye.
-- Detalle de la evaluación en lib/compat.ts.
create table public.compatibilities (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references public.product_types (id) on delete cascade,
  paper_id uuid references public.papers (id) on delete cascade,
  caliber_id uuid references public.calibers (id) on delete cascade,
  allowed boolean not null,
  reason text,
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  check (paper_id is not null or caliber_id is not null)
);
create unique index compatibilities_unique_rule
  on public.compatibilities (product_type_id, coalesce(paper_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(caliber_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.gallery_samples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^M-\d{3,5}$'),
  name text not null,
  description text,
  photo_url text,
  photos text[] not null default '{}',
  segments public.segment[] not null default '{}',
  product_type_id uuid references public.product_types (id) on delete set null,
  paper_id uuid references public.papers (id) on delete set null,
  finish_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  affects_price boolean not null default false,
  factory_notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null,
  value_type public.setting_type not null,
  description text,
  is_public boolean not null default false,
  is_provisional boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  channel public.message_channel not null,
  name text not null,
  description text,
  subject text,
  body text not null,
  variables text[] not null default '{}',
  is_active boolean not null default true,
  is_provisional boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (code, channel)
);

-- -----------------------------------------------------------------------------
-- Triggers de auditoría, RLS y lectura pública
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
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.set_audit_fields()', t || '_audit', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- El público (anon y usuarios) solo ve lo activo del catálogo.
  foreach t in array array[
    'categories', 'product_types', 'standard_sizes', 'papers', 'calibers', 'print_options',
    'finishes', 'eco_attributes', 'food_attributes', 'compatibilities', 'gallery_samples'
  ] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (is_active)', t || '_public_read', t);
  end loop;
end
$$;

-- Configuración: el público solo lee las claves marcadas como públicas.
create policy settings_public_read on public.settings
  for select to anon, authenticated using (is_public);

-- Notas para fábrica y datos internos no se exponen al rol anon (columnas).
do $$
declare
  t text;
  cols text;
begin
  foreach t in array array[
    'categories', 'product_types', 'standard_sizes', 'papers', 'calibers', 'print_options',
    'finishes', 'eco_attributes', 'food_attributes', 'gallery_samples'
  ] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t
       and column_name not in ('factory_notes', 'created_by', 'updated_by');
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select (%s) on public.%I to anon', cols, t);
  end loop;
  revoke all on public.compatibilities from anon;
  grant select (id, product_type_id, paper_id, caliber_id, allowed, reason, is_active) on public.compatibilities to anon;
  revoke all on public.settings from anon;
  grant select (key, value, value_type, is_public) on public.settings to anon;
  revoke all on public.message_templates from anon;
end
$$;
