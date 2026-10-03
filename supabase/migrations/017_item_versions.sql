-- =============================================================================
-- 017_item_versions — El equipo completa y corrige la ficha en el panel
-- (PAN-03, REG-04, REG-12)
-- =============================================================================

-- Cada edición de una pieza guarda la ficha anterior: los documentos ya
-- emitidos (RFQ, cotización) siguen apuntando a lo que se envió.
create table if not exists public.quote_item_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.quote_items (id) on delete cascade,
  request_id uuid not null references public.quote_requests (id) on delete cascade,
  version integer not null check (version >= 1),
  spec_snapshot jsonb not null,
  reason text not null check (length(reason) between 3 and 1000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (item_id, version)
);
create index if not exists quote_item_versions_request_idx on public.quote_item_versions (request_id, created_at desc);
alter table public.quote_item_versions enable row level security;
revoke all on public.quote_item_versions from anon;
create policy quote_item_versions_staff_read on public.quote_item_versions for select to authenticated using (public.is_staff());
create policy quote_item_versions_staff_insert on public.quote_item_versions for insert to authenticated with check (public.is_staff_editor());
revoke update, delete on public.quote_item_versions from authenticated;
create trigger quote_item_versions_audit before insert or update on public.quote_item_versions
  for each row execute function public.set_audit_fields();
