-- =============================================================================
-- 011_quote_numbering — Numerar la cotización dentro de la transacción del
-- equipo (DAT-01, DAT-05)
-- =============================================================================

-- next_document_number() sigue cerrada para anon y authenticated. Esta función
-- solo numera cotizaciones y solo la puede usar el equipo que edita, así
-- createQuoteDraft numera en su propia transacción sin abrir otra.
create or replace function public.next_quote_number() returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff_editor() then
    raise exception 'solo el equipo puede numerar cotizaciones' using errcode = '42501';
  end if;
  return public.next_document_number('C');
end;
$$;
revoke execute on function public.next_quote_number() from public, anon;
grant execute on function public.next_quote_number() to authenticated;

-- Un solo borrador por solicitud: dos "Preparar cotización" a la vez no crean
-- dos v1.
create unique index if not exists quotes_one_draft_per_request on public.quotes (request_id) where status = 'draft';
