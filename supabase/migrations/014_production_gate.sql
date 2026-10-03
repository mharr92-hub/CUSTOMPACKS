-- =============================================================================
-- 014_production_gate — Nada impreso entra a producción sin su último proof
-- aprobado y liberado (REG-04, REG-10, PRD §14)
-- =============================================================================

-- Pieza que llegó como "No sé, sugiéranme": su impresión está por definir.
-- Exige un proof o que el equipo confirme que va sin impresión (auditado).
alter table public.quote_items
  add column if not exists no_print_confirmed_at timestamptz,
  add column if not exists no_print_confirmed_by uuid references auth.users (id) on delete set null;

-- true si cada pieza que lleva (o puede llevar) impresión tiene su ÚLTIMA
-- versión de proof aprobada por el cliente y liberada a fábrica. lib/orders
-- (artworkStatus) aplica la misma regla para mostrarla en el panel.
create or replace function public.order_artwork_ready(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
      from public.orders o
      join public.quote_items i on i.request_id = o.request_id
     where o.id = p_order_id
       and (
         (coalesce((i.spec_snapshot ->> 'needsAdvice')::boolean, false) and i.no_print_confirmed_at is null)
         or (not coalesce((i.spec_snapshot ->> 'needsAdvice')::boolean, false)
             and coalesce(i.spec_snapshot ->> 'artwork', 'not_applicable') <> 'not_applicable')
       )
       and not coalesce((
         select f.status = 'released' and f.client_approved_at is not null
           from public.artwork_files f
          where f.item_id = i.id and f.kind = 'proof' and f.deleted_at is null
          order by f.version desc
          limit 1
       ), false)
  )
$$;
revoke execute on function public.order_artwork_ready(uuid) from public, anon;
grant execute on function public.order_artwork_ready(uuid) to authenticated;

create or replace function public.orders_production_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'in_production' and old.status is distinct from 'in_production'
     and not public.order_artwork_ready(new.id) then
    raise exception 'El pedido no puede entrar a producción: falta el último proof aprobado y liberado de alguna pieza impresa' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_production_gate on public.orders;
create trigger orders_production_gate before update of status on public.orders
  for each row execute function public.orders_production_gate();
