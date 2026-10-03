-- =============================================================================
-- 022_catalog_import — Catálogo real por plantillas CSV (Bloque 2)
-- =============================================================================

-- Cliente para el que se hizo la muestra (dato interno: no se publica sin
-- autorización escrita, pregunta 14). El rol anon no recibe la columna: los
-- permisos de anon sobre gallery_samples son por columna (migración 001).
alter table public.gallery_samples add column if not exists previous_client text;
comment on column public.gallery_samples.previous_client is 'Cliente anterior de la muestra. Interno: no se muestra en la web.';
