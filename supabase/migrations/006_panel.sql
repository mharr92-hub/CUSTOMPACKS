-- =============================================================================
-- 006_panel — Auditoría y asignación por turno (PRD §11)
-- Cada alta, cambio o baja en las tablas del negocio deja quién, qué, cuándo y
-- los valores antes/después (solo los campos que cambiaron).
-- =============================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor uuid,
  at timestamptz not null default now(),
  before jsonb,
  after jsonb,
  changed text[]
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, at desc);
create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_actor_idx on public.audit_log (actor, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_log_admin_read on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id uuid := coalesce(v_new ->> 'id', v_old ->> 'id')::uuid;
  v_changed text[];
  -- columnas de control y secretos: no aportan a la auditoría o no deben copiarse
  v_skip text[] := array['updated_at', 'updated_by', 'created_at', 'created_by', 'access_token', 'token', 'payload', 'spec_snapshot'];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(v_new) n
     where not (n.key = any (v_skip)) and n.value is distinct from (v_old -> n.key);
    if v_changed is null then
      return null;
    end if;
    v_old := (select jsonb_object_agg(k, v_old -> k) from unnest(v_changed) k);
    v_new := (select jsonb_object_agg(k, v_new -> k) from unnest(v_changed) k);
  else
    v_old := v_old - v_skip;
    v_new := v_new - v_skip;
  end if;
  insert into public.audit_log (table_name, record_id, action, actor, before, after, changed)
  values (tg_table_name, v_id, lower(tg_op), auth.uid(), v_old, v_new, v_changed);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'quote_requests', 'quote_items', 'companies', 'artwork_files', 'profiles', 'settings', 'message_templates',
    'categories', 'product_types', 'standard_sizes', 'papers', 'calibers', 'print_options', 'finishes',
    'eco_attributes', 'food_attributes', 'compatibilities', 'gallery_samples'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit_log', t);
  end loop;
end
$$;

-- Asignación "siguiente en turno": se reparte entre ventas activas por orden de última asignación.
alter table public.profiles add column last_assigned_at timestamptz;

-- Respuesta del cliente desde su enlace (datos faltantes): la registra el servidor.
comment on table public.activities is 'Historial de la solicitud: notas internas, contactos (canal), respuestas del cliente, notificaciones y cambios de arte.';

-- Aviso al equipo cuando el cliente responde desde su enlace (datos pendientes).
insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('client_replied_team', 'email', 'team', 'Respuesta del cliente (equipo)', 'El cliente respondió desde su enlace mientras la solicitud esperaba datos.',
   'Respuesta del cliente · {numero}',
   '{empresa} respondió en la solicitud {numero}: "{respuesta}". Revísala en el panel: {enlace_panel}.',
   '{numero,empresa,respuesta,enlace_panel}', true, 25)
on conflict (code, channel) do nothing;
