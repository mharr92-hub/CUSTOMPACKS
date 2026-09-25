-- =============================================================================
-- 010_itbms_demo — Leyenda de impuestos y marca de datos de demostración
-- =============================================================================

-- Precios sin impuesto con la leyenda "más ITBMS 7 %" (decisión de Mark,
-- 25/09/2026). Editable en Configuración; vacía, no se muestra.
insert into public.settings (key, value, value_type, description, is_public, is_provisional)
values ('tax_label', '"más ITBMS 7 %"', 'string',
        'Leyenda de impuestos junto a los precios y montos (editor, cotización PDF, estado de pagos y portal). Los precios se cotizan sin impuesto.',
        true, false)
on conflict (key) do nothing;

-- Datos de demostración (pnpm db:seed-demo): se marcan para distinguirlos en el panel.
alter table public.companies add column if not exists is_demo boolean not null default false;
alter table public.quote_requests add column if not exists is_demo boolean not null default false;
