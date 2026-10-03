-- =============================================================================
-- 021_business_decisions — Decisiones de Mark del 03/10/2026 (preguntas 1, 19,
-- 21, 22 y 23 de docs/PREGUNTAS.md)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) Pagos en partes: se acumulan; tolerancia por comisiones = 1 % del monto
-- o USD 25, lo que sea menor (D-113).
-- -----------------------------------------------------------------------------
delete from public.settings where key = 'payment_tolerance';
insert into public.settings (key, value, value_type, description, is_public, is_provisional) values
  ('payment_tolerance_pct', '1', 'number',
   'Tolerancia por comisiones bancarias, en % del monto del anticipo o del saldo. Se usa el menor entre este % y payment_tolerance_max.', false, false),
  ('payment_tolerance_max', '25', 'number',
   'Tolerancia máxima por comisiones bancarias, en la moneda del pedido.', false, false)
on conflict (key) do update set value = excluded.value, description = excluded.description, is_provisional = false;

create or replace function public.payment_tolerance(p_due numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select greatest(0, least(
    p_due * coalesce((select (value #>> '{}')::numeric from public.settings where key = 'payment_tolerance_pct'), 0) / 100,
    coalesce((select (value #>> '{}')::numeric from public.settings where key = 'payment_tolerance_max'), 0)))
$$;

create or replace function public.order_kind_covered(p_order_id uuid, p_kind public.payment_kind) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.order_paid(p_order_id, p_kind) >= d.due - public.payment_tolerance(d.due)
    from (select case when p_kind = 'deposit' then o.deposit_amount else o.balance_amount end as due
            from public.orders o where o.id = p_order_id) d
$$;

-- -----------------------------------------------------------------------------
-- (2) ITBMS: precios sin impuesto con la leyenda de settings.tax_label (D-102).
-- -----------------------------------------------------------------------------
update public.settings set is_provisional = false where key = 'tax_label';

-- -----------------------------------------------------------------------------
-- (3) La fábrica responde el RFQ en 48 horas hábiles (D-114).
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('factory_sla_hours', '48', 'number',
        'Horas hábiles que tiene la fábrica para responder un RFQ. Pasado ese tiempo se le reenvía un recordatorio y se avisa al equipo.', false, false)
on conflict (key) do update set value = excluded.value, is_provisional = false;

alter table public.factory_rfqs add column if not exists reminded_at timestamptz;

insert into public.message_templates (code, channel, audience, name, description, subject, body, variables, is_provisional, sort_order) values
  ('rfq_overdue_team', 'email', 'team', 'RFQ sin respuesta (equipo)', 'La fábrica no respondió el RFQ en factory_sla_hours horas hábiles.',
   'RFQ sin respuesta · {numero}',
   'La fábrica lleva {horas} horas hábiles sin responder el RFQ {rfq} de la solicitud {numero} ({empresa}). {recordatorio} Ábrela aquí: {enlace_panel}.',
   '{numero,empresa,horas,rfq,recordatorio,enlace_panel}', false, 131)
on conflict (code, channel) do nothing;

-- -----------------------------------------------------------------------------
-- (4) Retención (D-115): comprobantes y cotizaciones aceptadas, 5 años; fotos
-- y video de QA y arte, 24 meses después de cerrar el pedido.
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, value_type, description, is_public, is_provisional) values
  ('artwork_retention_months', '24', 'number',
   'Meses que se conserva el arte: desde el cierre del pedido, o desde la última actividad si la solicitud no se convirtió en pedido.', false, false),
  ('evidence_retention_months', '24', 'number', 'Meses que se conservan las fotos y videos de QA y de los hitos, desde el cierre del pedido.', false, false),
  ('legal_documents_retention_years', '5', 'number',
   'Años que se conservan los comprobantes de pago y las cotizaciones aceptadas (PDF), desde el cierre del pedido.', false, false)
on conflict (key) do update set value = excluded.value, description = excluded.description, is_provisional = false;

-- Archivos fuera de artwork_files cuya retención venció: evidencias de hitos y
-- QA (bucket evidence), comprobantes de pago, PDF de cotizaciones y constancias
-- de aceptación (bucket documents). El cron los marca; admin confirma el
-- borrado en /admin/archivos y entonces se quita la referencia de la fila de
-- origen (source_id).
create table if not exists public.retention_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('evidence', 'receipt', 'quote_pdf', 'acceptance')),
  bucket text not null,
  storage_path text not null unique,
  request_id uuid references public.quote_requests (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  source_id uuid not null,
  file_name text,
  flagged_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create trigger retention_items_audit before insert or update on public.retention_items
  for each row execute function public.set_audit_fields();
create index if not exists retention_items_pending_idx on public.retention_items (flagged_at) where deleted_at is null;
alter table public.retention_items enable row level security;
revoke all on public.retention_items from anon;
revoke insert, update, delete on public.retention_items from authenticated;
create policy retention_items_admin_read on public.retention_items for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- (5) Ley 81 (D-116): se anonimiza el contacto y se borran los borradores
-- siempre. En solicitudes NO convertidas en pedido también se borran
-- referencias, arte y proofs, y los PDF de cotizaciones no aceptadas. En las
-- convertidas se conservan la cotización aceptada (con su constancia de
-- aceptación), el pedido, los pagos, la aprobación del proof y el arte, que
-- siguen la retención del punto (4).
-- -----------------------------------------------------------------------------
drop function if exists public.anonymize_request(uuid);

create function public.anonymize_request(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_draft uuid;
  v_converted boolean;
  v_label text := 'Anonimizado';
  v_email text := 'anonimizado@anonimizado.invalid';
  v_artwork text[] := '{}';
  v_documents text[] := '{}';
  v_drafts integer := 0;
begin
  if not public.is_admin() and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    raise exception 'Solo admin puede anonimizar' using errcode = '42501';
  end if;
  perform set_config('app.anonymizing', 'on', true);
  select company_id, draft_id into v_company, v_draft from public.quote_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  v_converted := exists (select 1 from public.orders where request_id = p_request_id);

  update public.quote_requests
     set contact_name = v_label, contact_position = null, contact_email = v_email, contact_whatsapp = null,
         delivery_address = null, delivery_city = null, comments = null, company_name = null, ruc = null,
         consent_ip = null, utm = '{}'::jsonb, referrer = null, lead_source = null
   where id = p_request_id;

  if v_company is not null and not exists (select 1 from public.quote_requests where company_id = v_company and id <> p_request_id) then
    update public.companies set legal_name = null, trade_name = v_label, ruc = null, city = null, default_address = null where id = v_company;
  end if;

  update public.notifications
     set recipient = v_label, subject = null, body = null, wa_link = null, payload = public.strip_personal(payload), error = null
   where request_id = p_request_id;
  update public.activities set body = null, payload = public.strip_personal(payload) where request_id = p_request_id;
  update public.surveys set comment = null, ip = null where request_id = p_request_id;
  update public.payments p set notes = null from public.orders o where o.id = p.order_id and o.request_id = p_request_id;
  update public.orders set delivery_address = null, delivery_city = null, notes = null where request_id = p_request_id;

  if v_converted then
    -- Constancia de la cotización aceptada y del proof aprobado: documentos
    -- legales del pedido (punto 4). Se conserva el nombre de quien aceptó; se
    -- quitan el correo, la IP y el navegador.
    update public.quotes set accepted_by_email = null, accepted_ip = null, accepted_user_agent = null where request_id = p_request_id;
    update public.artwork_approvals set approved_by_email = null, ip = null, user_agent = null where request_id = p_request_id;
  else
    update public.quotes
       set accepted_by_name = case when accepted_by_name is null then null else v_label end,
           accepted_by_email = null, accepted_ip = null, accepted_user_agent = null
     where request_id = p_request_id;
    update public.artwork_approvals set approved_by_name = v_label, approved_by_email = null, ip = null, user_agent = null where request_id = p_request_id;

    -- Arte, proofs y fotos de referencia.
    select coalesce(array_agg(storage_path), '{}') into v_artwork from (
      select storage_path from public.artwork_files where request_id = p_request_id and deleted_at is null
      union
      select r.storage_path from public.quote_references r join public.quote_items i on i.id = r.item_id
       where i.request_id = p_request_id and r.kind = 'photo' and r.storage_path is not null
    ) f;
    update public.artwork_files set deleted_at = now() where request_id = p_request_id and deleted_at is null;
    delete from public.quote_references r using public.quote_items i where i.id = r.item_id and i.request_id = p_request_id;

    -- PDF de cotizaciones que no se aceptaron.
    select coalesce(array_agg(pdf_path), '{}') into v_documents
      from public.quotes where request_id = p_request_id and pdf_path is not null and status <> 'accepted';
    update public.quotes set pdf_path = null where request_id = p_request_id and pdf_path is not null and status <> 'accepted';
  end if;

  -- Borradores (siempre): sus archivos se borran salvo los que pasaron a ser
  -- arte o referencias de un pedido que se conserva.
  select v_artwork || coalesce(array_agg(f.storage_path), '{}') into v_artwork
    from public.quote_draft_files f join public.quote_drafts d on d.id = f.draft_id
   where (d.id = v_draft or d.submitted_request_id = p_request_id)
     and not (f.storage_path = any (v_artwork))
     and not exists (select 1 from public.artwork_files a where a.storage_path = f.storage_path and a.deleted_at is null)
     and not exists (select 1 from public.quote_references r where r.storage_path = f.storage_path);
  delete from public.quote_drafts where id = v_draft or submitted_request_id = p_request_id;
  get diagnostics v_drafts = row_count;

  update public.audit_log
     set before = public.strip_personal(before), after = public.strip_personal(after)
   where (table_name = 'quote_requests' and record_id = p_request_id)
      or (table_name = 'companies' and record_id = v_company and not exists (select 1 from public.quote_requests where company_id = v_company and id <> p_request_id))
      or (table_name in ('quote_items', 'artwork_files', 'quotes') and record_id in (
            select id from public.quote_items where request_id = p_request_id
            union all select id from public.artwork_files where request_id = p_request_id
            union all select id from public.quotes where request_id = p_request_id));

  insert into public.audit_log (table_name, record_id, action, actor, after, changed)
  values ('quote_requests', p_request_id, 'update', auth.uid(), jsonb_build_object('anonymized', true, 'converted', v_converted), array['anonymized']);
  return jsonb_build_object('converted', v_converted, 'drafts', v_drafts, 'artwork', to_jsonb(v_artwork), 'documents', to_jsonb(v_documents));
end;
$$;
revoke execute on function public.anonymize_request(uuid) from public, anon;
grant execute on function public.anonymize_request(uuid) to authenticated;
