-- =============================================================================
-- 013_system_transitions — "RFQ enviado", "Cotizada" y "Aceptada" solo los
-- fija el sistema (REG-03, PAN-01, PAN-05)
-- =============================================================================

-- Con el rol de un usuario (authenticated) o del público (anon), esos tres
-- estados solo se aceptan si la transacción marcó app.system_transition = 'on'.
-- Lo marcan las funciones del servidor que hacen el trabajo de verdad: enviar
-- o marcar enviado el RFQ, emitir la cotización y registrar la aceptación. El
-- selector manual del panel no lo marca, así que no puede saltarse el RFQ, la
-- cotización ni la creación del pedido. Los procesos del servidor que corren
-- sin rol (servicio) no cambian.
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
    if new.status in ('rfq_sent', 'quoted', 'accepted')
       and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
       and coalesce(current_setting('app.system_transition', true), '') <> 'on' then
      raise exception 'El estado % lo fija el sistema (RFQ, cotización o aceptación), no el selector', new.status using errcode = '42501';
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

-- Aceptación registrada por el equipo (WhatsApp, correo o llamada; PRD §11):
-- canal y captura opcional quedan en la cotización.
alter table public.quotes
  add column if not exists accepted_channel text check (accepted_channel is null or accepted_channel in ('portal', 'whatsapp', 'email', 'call')),
  add column if not exists accepted_recorded_by uuid references auth.users (id) on delete set null,
  add column if not exists accepted_evidence_path text;
