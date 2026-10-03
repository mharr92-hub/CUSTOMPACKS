-- =============================================================================
-- 012_rfq_fx — Tipo de cambio de la respuesta de fábrica (REG-11, PAN-13, FUT-12)
-- =============================================================================

-- Si la fábrica responde en una moneda distinta de la de la cotización
-- (settings.currency), la respuesta guarda el tipo de cambio y su fecha:
-- fx_rate = unidades de la moneda de fábrica por 1 unidad de la moneda de
-- la cotización (por ejemplo, 3.75 soles por 1 dólar).
alter table public.factory_rfqs
  add column if not exists fx_rate numeric(14, 6) check (fx_rate is null or fx_rate > 0),
  add column if not exists fx_date date;

comment on column public.factory_rfqs.fx_rate is 'Unidades de la moneda de fábrica por 1 unidad de la moneda de la cotización. Obligatorio cuando currency difiere de settings.currency.';
