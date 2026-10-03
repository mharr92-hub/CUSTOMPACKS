-- =============================================================================
-- 016_payments_reconciled — Pagos conciliados por monto (DAT-02, REG-02,
-- PAN-02, FUT-01, REG-06, REG-13, COD-03)
-- =============================================================================

-- Un pago mal cargado se anula (con motivo y auditado), no se borra.
alter type public.payment_status add value if not exists 'voided';
alter table public.payments
  add column if not exists voided_reason text,
  add column if not exists voided_by uuid references auth.users (id) on delete set null,
  add column if not exists voided_at timestamptz;

-- La misma referencia bancaria no se carga dos veces para el mismo pedido y tipo.
create unique index if not exists payments_reference_unique
  on public.payments (order_id, kind, lower(reference))
  where reference is not null and status in ('pending', 'confirmed');

-- Tolerancia para dar por cubierto un monto (comisiones bancarias). PROVISIONAL
-- en 0 hasta que Mark responda la pregunta 19 de docs/PREGUNTAS.md.
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('payment_tolerance', '0', 'number',
        'Diferencia máxima (en la moneda del pedido) para dar por cubierto el anticipo o el saldo. 0: los pagos confirmados deben sumar el monto completo.',
        false, true)
on conflict (key) do nothing;

-- Pagos: el equipo los registra y revisa desde el servidor, que valida el rol
-- y la conciliación; nadie los escribe directo con su sesión.
revoke insert, update, delete on public.payments from authenticated;

-- Suma confirmada de un tipo de pago y si cubre el monto del pedido.
create or replace function public.order_paid(p_order_id uuid, p_kind public.payment_kind) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0) from public.payments
   where order_id = p_order_id and kind = p_kind and status = 'confirmed'
$$;

create or replace function public.order_kind_covered(p_order_id uuid, p_kind public.payment_kind) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.order_paid(p_order_id, p_kind) >=
         (case when p_kind = 'deposit' then o.deposit_amount else o.balance_amount end)
         - coalesce((select (s.value #>> '{}')::numeric from public.settings s where s.key = 'payment_tolerance'), 0)
    from public.orders o where o.id = p_order_id
$$;
revoke execute on function public.order_paid(uuid, public.payment_kind) from public, anon;
revoke execute on function public.order_kind_covered(uuid, public.payment_kind) from public, anon;
grant execute on function public.order_paid(uuid, public.payment_kind) to authenticated;
grant execute on function public.order_kind_covered(uuid, public.payment_kind) to authenticated;

-- Reglas del pedido en la base (§14): producir exige el anticipo cubierto;
-- cerrar exige el saldo cubierto. Los montos no se editan: un cambio pasa
-- por una cotización nueva.
create or replace function public.orders_money_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.total_amount, new.deposit_amount, new.balance_amount, new.lines, new.currency)
     is distinct from (old.total_amount, old.deposit_amount, old.balance_amount, old.lines, old.currency) then
    raise exception 'Los montos del pedido no se editan: un cambio pasa por una cotización nueva' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'in_production' and not public.order_kind_covered(new.id, 'deposit') then
      raise exception 'El pedido no puede entrar a producción: el anticipo no está cubierto' using errcode = '23514';
    end if;
    if new.status = 'closed' and not public.order_kind_covered(new.id, 'balance') then
      raise exception 'El pedido no se puede cerrar: el saldo no está cubierto' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Los triggers BEFORE corren en orden alfabético: estas reglas van después de
-- la máquina de estados (orders_state_machine), que da el error más claro.
drop trigger if exists orders_zz_money_rules on public.orders;
create trigger orders_zz_money_rules before update on public.orders
  for each row execute function public.orders_money_rules();
drop trigger if exists orders_production_gate on public.orders;
drop trigger if exists orders_zz_production_gate on public.orders;
create trigger orders_zz_production_gate before update of status on public.orders
  for each row execute function public.orders_production_gate();

-- Anular un anticipo antes de producir devuelve el pedido a "Esperando anticipo".
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('pending_deposit'::public.order_status, 'deposit_received'::public.order_status),
    ('deposit_received', 'pending_deposit'),
    ('deposit_received', 'in_production'),
    ('in_production', 'qa'),
    ('qa', 'shipped'),
    ('shipped', 'in_customs'),
    ('shipped', 'delivered'),
    ('in_customs', 'delivered'),
    ('delivered', 'closed')
  )
$$;
