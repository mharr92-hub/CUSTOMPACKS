-- =============================================================================
-- 020_personal_data — Derecho de acceso y eliminación (Ley 81 de 2019; PRD
-- §15; DAT-03, SEG-07, PAN-12)
-- =============================================================================

-- Registros inmutables (aprobación del proof): la única excepción es la
-- anonimización, que reemplaza los datos personales y deja todo lo demás.
create or replace function public.forbid_change() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.anonymizing', true), '') = 'on' then
    return new;
  end if;
  raise exception 'Registro inmutable: % no admite %', tg_table_name, tg_op using errcode = '42501';
end;
$$;

-- Claves con datos personales en las copias JSON (auditoría, avisos, borradores).
create or replace function public.strip_personal(p jsonb) returns jsonb
language sql immutable as $$
  select case when p is null then null else p
    - array['contact_name', 'contact_position', 'contact_email', 'contact_whatsapp', 'delivery_address', 'delivery_city',
            'company_name', 'ruc', 'comments', 'consent_ip', 'referrer', 'utm', 'accepted_by_name', 'accepted_by_email',
            'accepted_ip', 'accepted_user_agent', 'approved_by_name', 'approved_by_email', 'ip', 'user_agent', 'email', 'name',
            'legal_name', 'trade_name', 'default_address', 'recipient', 'body', 'wa_link', 'vars', 'contact']
  end
$$;

/**
 * Anonimiza una solicitud y todo lo que la copia. Conserva montos, números de
 * documento, fichas técnicas, estados y fechas (obligación contable; pregunta
 * 22 de docs/PREGUNTAS.md). Solo admin. Devuelve las rutas de archivos de arte
 * y fotos para que el servidor los borre del Storage.
 */
create or replace function public.anonymize_request(p_request_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
  v_company uuid;
  v_draft uuid;
  v_label text := 'Anonimizado';
  v_email text := 'anonimizado@anonimizado.invalid';
begin
  if not public.is_admin() and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon') then
    raise exception 'Solo admin puede anonimizar' using errcode = '42501';
  end if;
  perform set_config('app.anonymizing', 'on', true);
  select company_id, draft_id into v_company, v_draft from public.quote_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;

  update public.quote_requests
     set contact_name = v_label, contact_position = null, contact_email = v_email, contact_whatsapp = null,
         delivery_address = null, delivery_city = null, comments = null, company_name = null, ruc = null,
         consent_ip = null, utm = '{}'::jsonb, referrer = null, lead_source = null
   where id = p_request_id;

  if v_company is not null and not exists (select 1 from public.quote_requests where company_id = v_company and id <> p_request_id) then
    update public.companies set legal_name = null, trade_name = v_label, ruc = null, city = null, default_address = null where id = v_company;
  end if;

  if v_draft is not null then
    update public.quote_drafts set payload = '{}'::jsonb, contact_email = null, contact_whatsapp = null, resume_email = null where id = v_draft;
  end if;

  update public.notifications
     set recipient = v_label, subject = null, body = null, wa_link = null, payload = public.strip_personal(payload), error = null
   where request_id = p_request_id;
  update public.activities set body = null, payload = public.strip_personal(payload) where request_id = p_request_id;
  update public.quotes
     set accepted_by_name = case when accepted_by_name is null then null else v_label end,
         accepted_by_email = null, accepted_ip = null, accepted_user_agent = null
   where request_id = p_request_id;
  update public.artwork_approvals set approved_by_name = v_label, approved_by_email = null, ip = null, user_agent = null where request_id = p_request_id;
  update public.surveys set comment = null, ip = null where request_id = p_request_id;
  update public.payments p set notes = null from public.orders o where o.id = p.order_id and o.request_id = p_request_id;
  update public.orders set delivery_address = null, delivery_city = null, notes = null where request_id = p_request_id;

  update public.audit_log
     set before = public.strip_personal(before), after = public.strip_personal(after)
   where (table_name = 'quote_requests' and record_id = p_request_id)
      or (table_name = 'companies' and record_id = v_company and not exists (select 1 from public.quote_requests where company_id = v_company and id <> p_request_id))
      or (table_name in ('quote_items', 'artwork_files', 'quotes') and record_id in (
            select id from public.quote_items where request_id = p_request_id
            union all select id from public.artwork_files where request_id = p_request_id
            union all select id from public.quotes where request_id = p_request_id));

  -- Archivos del titular: arte y fotos de referencia (las evidencias de QA y
  -- los comprobantes se conservan con el pedido).
  select coalesce(array_agg(storage_path), '{}') into v_paths from (
    select storage_path from public.artwork_files where request_id = p_request_id and kind = 'artwork' and deleted_at is null
    union all
    select r.storage_path from public.quote_references r join public.quote_items i on i.id = r.item_id
     where i.request_id = p_request_id and r.kind = 'photo' and r.storage_path is not null
  ) f;
  update public.artwork_files set deleted_at = now() where request_id = p_request_id and kind = 'artwork' and deleted_at is null;
  delete from public.quote_references r using public.quote_items i where i.id = r.item_id and i.request_id = p_request_id and r.kind in ('photo', 'link');

  insert into public.audit_log (table_name, record_id, action, actor, after, changed)
  values ('quote_requests', p_request_id, 'update', auth.uid(), jsonb_build_object('anonymized', true), array['anonymized']);
  return v_paths;
end;
$$;
revoke execute on function public.anonymize_request(uuid) from public, anon;
grant execute on function public.anonymize_request(uuid) to authenticated;
