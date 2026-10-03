-- =============================================================================
-- 015_kpi_data — Datos de los KPI de PRD §3 que no se pueden reconstruir
-- después (PAN-14, REG-12, DAT-16)
-- =============================================================================

-- Paso máximo al que llegó cada borrador (embudo del cotizador).
alter table public.quote_drafts
  add column if not exists max_step integer not null default 0 check (max_step between 0 and 9);
update public.quote_drafts set max_step = step where max_step < step;

-- Embudo anónimo: al purgar un borrador sin enviar queda una fila sin datos
-- personales, para medir el abandono más allá de los 30 días del borrador.
create table if not exists public.wizard_funnel (
  id uuid primary key default gen_random_uuid(),
  draft_started_at timestamptz not null,
  last_activity_at timestamptz not null,
  max_step integer not null check (max_step between 0 and 9),
  segment text,
  submitted boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create index if not exists wizard_funnel_started_idx on public.wizard_funnel (draft_started_at);
alter table public.wizard_funnel enable row level security;
revoke all on public.wizard_funnel from anon;
revoke insert, update, delete on public.wizard_funnel from authenticated;
create policy wizard_funnel_staff_read on public.wizard_funnel for select to authenticated using (public.is_staff());

-- Semáforo y faltantes al enviar, congelados: "completa a la primera" no
-- cambia cuando el equipo completa la ficha después. Minutos de completado.
alter table public.quote_requests
  add column if not exists initial_traffic_light public.traffic_light,
  add column if not exists initial_missing_fields text[],
  add column if not exists completion_minutes integer check (completion_minutes is null or completion_minutes >= 0);
update public.quote_requests
   set initial_traffic_light = traffic_light, initial_missing_fields = missing_fields
 where initial_traffic_light is null;
