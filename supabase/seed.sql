-- =============================================================================
-- Datos maestros PROVISIONALES (PRD §7). Son una propuesta basada en
-- estándares de la industria: todo va con is_provisional = true hasta validarlo
-- contra la maleta de muestras y la ficha técnica de la fábrica.
-- Los valores definidos por Mark (50/50, 30 y 45 días) no son provisionales.
-- Idempotente: se puede correr varias veces.
-- =============================================================================

-- Categorías ------------------------------------------------------------------
insert into public.categories (code, slug, name, description, sort_order, is_active, is_provisional) values
  ('CAJ', 'cajas', 'Cajas', 'Cajas plegadizas, rígidas y de envío para producto, regalo y e-commerce.', 1, true, true),
  ('BOL', 'bolsas', 'Bolsas', 'Bolsas de papel con o sin asa para tiendas, panaderías y pedidos para llevar.', 2, true, true),
  ('BPR', 'bolsas-premium', 'Bolsas premium', 'Bolsas boutique con acabados finos para marcas que cuidan cada detalle.', 3, true, true),
  ('ALI', 'empaque-alimentario', 'Empaque alimentario', 'Empaque para comida rápida, food service y delivery.', 4, true, true),
  ('COM', 'complementos', 'Complementos', 'Insertos, separadores y etiquetas. Categoría opcional por confirmar.', 5, false, true)
on conflict (code) do nothing;

-- Tipos de producto: 12 cajas + 6 bolsas -----------------------------------------
insert into public.product_types (code, slug, name, description, category_id, segments, size_family, typical_uses, sort_order, is_provisional)
select v.code, v.slug, v.name, v.description, c.id, v.segments::public.segment[], v.size_family::public.size_family, v.typical_uses, v.sort_order, true
from (values
  ('CJ-01', 'plegadiza-con-tapa', 'Caja plegadiza con tapa', 'La caja de producto más versátil: se arma en segundos y cierra con solapas en ambos extremos.', 'CAJ', '{commercial,food}', 'box', array['Cosméticos y cuidado personal', 'Alimentos secos y confitería', 'Productos pequeños de tienda'], 1),
  ('CJ-02', 'autoarmable-fondo-automatico', 'Caja autoarmable de fondo automático', 'El fondo se arma solo al abrir la caja: rápida de armar y firme para productos con más peso.', 'CAJ', '{commercial,food}', 'box', array['Botellas y frascos', 'Kits y combos', 'Productos de mayor peso'], 2),
  ('CJ-03', 'bandeja', 'Bandeja', 'Base abierta con paredes firmes para exhibir o servir.', 'CAJ', '{commercial,food}', 'box', array['Exhibición en vitrina', 'Repostería y postres', 'Presentación de kits'], 3),
  ('CJ-04', 'dos-piezas-base-y-tapa', 'Caja de dos piezas (base y tapa)', 'Base y tapa independientes para una apertura con presencia.', 'CAJ', '{commercial}', 'box', array['Regalos corporativos', 'Ropa y accesorios', 'Calzado'], 4),
  ('CJ-05', 'caja-rigida', 'Caja rígida', 'Estructura rígida que no se pliega, para productos de alto valor.', 'CAJ', '{commercial}', 'box', array['Lanzamientos de producto', 'Joyería y relojería', 'Ediciones especiales'], 5),
  ('CJ-06', 'mailer-de-envio', 'Mailer de envío (tapa abatible)', 'Caja de envío con tapa abatible que protege el producto y luce al abrirse.', 'CAJ', '{commercial}', 'box', array['E-commerce', 'Suscripciones', 'Envíos de campaña'], 6),
  ('CJ-07', 'gable-con-asa', 'Caja gable con asa', 'Caja con asa integrada, fácil de transportar.', 'CAJ', '{commercial,food}', 'box', array['Combos para llevar', 'Regalos', 'Eventos'], 7),
  ('CJ-08', 'clamshell-hamburguesa', 'Clamshell para hamburguesa', 'Caja con tapa tipo concha que se cierra sola, pensada para hamburguesas y sándwiches.', 'ALI', '{food}', 'food_box', array['Hamburguesas', 'Sándwiches calientes', 'Porciones individuales'], 8),
  ('CJ-09', 'cono-para-papas', 'Cono o scoop para papas', 'Envase abierto para servir y comer papas y snacks.', 'ALI', '{food}', 'food_box', array['Papas fritas', 'Snacks', 'Porciones para compartir'], 9),
  ('CJ-10', 'balde-para-pollo', 'Balde para pollo', 'Balde de papel para porciones grandes y combos familiares.', 'ALI', '{food}', 'food_box', array['Pollo frito', 'Combos familiares', 'Alitas'], 10),
  ('CJ-11', 'caja-para-pizza', 'Caja para pizza', 'Caja plana de cierre firme para pizza y productos horneados.', 'ALI', '{food}', 'food_box', array['Pizza', 'Focaccia', 'Tartas saladas'], 11),
  ('CJ-12', 'caja-pasteleria', 'Caja para torta y pastelería', 'Caja para tortas y pastelería, con o sin ventana.', 'ALI', '{food}', 'food_box', array['Tortas', 'Pastelería', 'Cajas de postres'], 12),
  ('BL-01', 'bolsa-kraft-asa-plana', 'Bolsa kraft con asa plana', 'Bolsa de papel kraft con asa plana de papel.', 'BOL', '{commercial,food}', 'bag', array['Tiendas de retail', 'Farmacias', 'Comida para llevar'], 13),
  ('BL-02', 'bolsa-kraft-asa-retorcida', 'Bolsa kraft con asa retorcida', 'Bolsa de papel kraft con asa de papel retorcido.', 'BOL', '{commercial}', 'bag', array['Tiendas de ropa', 'Regalos', 'Ferias y eventos'], 14),
  ('BL-03', 'bolsa-boutique-laminada', 'Bolsa boutique laminada con asa de cordón', 'Bolsa premium con laminado y asa de cordón.', 'BPR', '{commercial}', 'bag', array['Moda y accesorios', 'Joyería', 'Perfumería'], 15),
  ('BL-04', 'bolsa-sos-fondo-cuadrado', 'Bolsa SOS de fondo cuadrado (sin asa)', 'Bolsa sin asa con fondo cuadrado que se para sola.', 'BOL', '{commercial,food}', 'bag', array['Panaderías', 'Supermercados', 'Cafeterías'], 16),
  ('BL-05', 'bolsa-delivery', 'Bolsa para delivery', 'Bolsa pensada para pedidos a domicilio.', 'ALI', '{food}', 'bag', array['Delivery', 'Pedidos para llevar', 'Dark kitchens'], 17),
  ('BL-06', 'bolsa-antigrasa', 'Bolsa antigrasa', 'Bolsa de papel con barrera contra grasa y humedad.', 'ALI', '{food}', 'bag', array['Frituras', 'Panadería', 'Snacks'], 18)
) as v (code, slug, name, description, category_code, segments, size_family, typical_uses, sort_order)
join public.categories c on c.code = v.category_code
on conflict (code) do nothing;

-- Tamaños estándar S1–S10 por familia (medidas interiores en cm) -------------------
insert into public.standard_sizes (code, name, family, length_cm, width_cm, height_cm, sort_order, is_provisional)
select v.code, v.name, v.family::public.size_family, v.l, v.w, v.h, v.sort_order, true
from (values
  ('CJ-S01', 'S1', 'box', 8, 5, 3, 1),       ('CJ-S02', 'S2', 'box', 10, 7, 4, 2),
  ('CJ-S03', 'S3', 'box', 12, 8, 5, 3),      ('CJ-S04', 'S4', 'box', 15, 10, 6, 4),
  ('CJ-S05', 'S5', 'box', 18, 12, 8, 5),     ('CJ-S06', 'S6', 'box', 22, 15, 10, 6),
  ('CJ-S07', 'S7', 'box', 26, 18, 12, 7),    ('CJ-S08', 'S8', 'box', 30, 22, 15, 8),
  ('CJ-S09', 'S9', 'box', 35, 25, 18, 9),    ('CJ-S10', 'S10', 'box', 40, 30, 20, 10),
  ('BL-S01', 'S1', 'bag', 14, 7, 20, 1),     ('BL-S02', 'S2', 'bag', 18, 8, 24, 2),
  ('BL-S03', 'S3', 'bag', 20, 10, 28, 3),    ('BL-S04', 'S4', 'bag', 24, 12, 30, 4),
  ('BL-S05', 'S5', 'bag', 26, 12, 34, 5),    ('BL-S06', 'S6', 'bag', 30, 12, 36, 6),
  ('BL-S07', 'S7', 'bag', 32, 14, 40, 7),    ('BL-S08', 'S8', 'bag', 36, 16, 42, 8),
  ('BL-S09', 'S9', 'bag', 40, 18, 45, 9),    ('BL-S10', 'S10', 'bag', 45, 20, 50, 10),
  ('AL-S01', 'S1', 'food_box', 9, 9, 6, 1),  ('AL-S02', 'S2', 'food_box', 11, 11, 7, 2),
  ('AL-S03', 'S3', 'food_box', 13, 13, 8, 3), ('AL-S04', 'S4', 'food_box', 15, 15, 9, 4),
  ('AL-S05', 'S5', 'food_box', 18, 18, 10, 5), ('AL-S06', 'S6', 'food_box', 20, 20, 12, 6),
  ('AL-S07', 'S7', 'food_box', 25, 25, 5, 7), ('AL-S08', 'S8', 'food_box', 30, 30, 4, 8),
  ('AL-S09', 'S9', 'food_box', 35, 35, 4, 9), ('AL-S10', 'S10', 'food_box', 40, 40, 5, 10)
) as v (code, name, family, l, w, h, sort_order)
on conflict (code) do nothing;

-- Papeles (5) -----------------------------------------------------------------
insert into public.papers (code, name, description, is_barrier, suggested_for_conditions, sort_order, is_provisional) values
  ('PA-01', 'Kraft (natural o blanco)', 'Papel de fibra resistente, natural (marrón) o blanqueado; típico de bolsas y cajas con look artesanal.', false, '{}', 1, true),
  ('PA-02', 'Cartulina plegadiza (SBS o dúplex)', 'Cartón delgado y rígido para cajas impresas de producto y alimentos.', false, '{}', 2, true),
  ('PA-03', 'Cartón microcorrugado (flauta E o B)', 'Cartón con capa ondulada para cajas de envío y resistencia.', false, '{fragile}', 3, true),
  ('PA-04', 'Papel estucado (couché)', 'Papel de superficie lisa para impresión de alta calidad y acabados premium.', false, '{}', 4, true),
  ('PA-05', 'Papel antigrasa o con barrera', 'Papel con barrera que resiste aceite y humedad; uso en comida rápida.', true, '{grease,hot,liquid}', 5, true)
on conflict (code) do nothing;

-- Calibres (3). Gramaje por definir con fábrica --------------------------------
insert into public.calibers (code, name, description, grammage_gsm, points, simple_label, min_weight_g, max_weight_g, sort_order, is_provisional) values
  ('CA-01', 'Ligero', 'Calibre delgado para productos livianos.', null, null, 'Para productos livianos, hasta 500 g', 0, 500, 1, true),
  ('CA-02', 'Medio', 'Calibre intermedio para la mayoría de productos.', null, null, 'Para productos de 500 g a 2 kg', 500, 2000, 2, true),
  ('CA-03', 'Pesado', 'Calibre grueso para productos pesados o envíos.', null, null, 'Para productos de más de 2 kg o envíos', 2000, null, 3, true)
on conflict (code) do nothing;

-- Impresión --------------------------------------------------------------------
insert into public.print_options (code, name, description, ink_count, requires_pantone, is_no_print, sort_order, is_provisional) values
  ('PR-00', 'Sin impresión', 'Empaque liso, sin tintas.', 0, false, true, 1, true),
  ('PR-01', '1 tinta', 'Un color plano, ideal para logos sencillos.', 1, false, false, 2, true),
  ('PR-02', '2 tintas', 'Dos colores planos.', 2, false, false, 3, true),
  ('PR-04', '4 tintas (CMYK, full color)', 'Impresión a todo color para fotos y degradados.', 4, false, false, 4, true),
  ('PR-PT', 'Pantone especial', 'Tinta plana de color exacto identificada por código Pantone.', null, true, false, 5, true),
  ('PR-4P', 'Más de 4 tintas', 'Full color más tintas especiales.', null, false, false, 6, true)
on conflict (code) do nothing;

-- Acabados ---------------------------------------------------------------------
insert into public.finishes (code, name, description, sort_order, is_provisional) values
  ('AC-01', 'Laminado mate', 'Película mate sobre la impresión: protege y da un tacto suave.', 1, true),
  ('AC-02', 'Laminado brillo', 'Película brillante que resalta los colores.', 2, true),
  ('AC-03', 'Barniz UV parcial', 'Brillo localizado para destacar logos o detalles.', 3, true),
  ('AC-04', 'Barniz UV total', 'Capa de brillo y protección en toda la superficie.', 4, true),
  ('AC-05', 'Hot stamping (foil)', 'Lámina metálica o de color aplicada con calor y presión.', 5, true),
  ('AC-06', 'Relieve o bajorrelieve', 'Zonas levantadas o hundidas en el papel.', 6, true),
  ('AC-07', 'Ventana con película', 'Ventana troquelada con película transparente para ver el producto.', 7, true),
  ('AC-08', 'Troquel especial', 'Forma o recorte a medida.', 8, true)
on conflict (code) do nothing;

-- Atributos ambientales (solo texto; sin sellos hasta tener certificado) ---------
insert into public.eco_attributes (code, name, description, show_badge, sort_order, is_provisional) values
  ('EC-01', 'Papel reciclado', 'Fabricado con fibra reciclada.', false, 1, true),
  ('EC-02', 'Fibra de origen certificado', 'Fibra de bosques con manejo certificado, sujeta a disponibilidad de certificado vigente.', false, 2, true),
  ('EC-03', 'Compostable', 'Material que puede compostarse, sujeto a ficha técnica de fábrica.', false, 3, true),
  ('EC-04', 'Sin recubrimiento plástico', 'Sin película plástica sobre el papel.', false, 4, true)
on conflict (code) do nothing;

-- Aptitud alimentaria ------------------------------------------------------------
insert into public.food_attributes (code, name, description, suggested_for_conditions, sort_order, is_provisional) values
  ('AL-01', 'Contacto directo con alimentos', 'Apto para que el alimento toque el empaque.', '{}', 1, true),
  ('AL-02', 'Resistente a grasa', 'Soporta aceite y grasa sin mancharse ni debilitarse.', '{grease}', 2, true),
  ('AL-03', 'Apto para calor', 'Soporta alimentos calientes.', '{hot}', 3, true),
  ('AL-04', 'Apto para frío o congelado', 'Soporta refrigeración y congelación.', '{cold}', 4, true),
  ('AL-05', 'Apto para microondas', 'Puede calentarse en microondas.', '{}', 5, true)
on conflict (code) do nothing;

-- Compatibilidades de ejemplo (6) ---------------------------------------------------
insert into public.compatibilities (product_type_id, paper_id, caliber_id, allowed, reason, is_provisional)
select pt.id, pa.id, ca.id, v.allowed, v.reason, true
from (values
  ('CJ-10', 'PA-05', null, true, 'El balde para pollo exige papel antigrasa.'),
  ('CJ-09', 'PA-05', null, true, 'El cono para papas exige papel antigrasa.'),
  ('CJ-05', 'PA-03', null, false, 'La caja rígida no se fabrica en microcorrugado.'),
  ('CJ-06', null, 'CA-01', false, 'El mailer de envío necesita calibre medio o pesado.'),
  ('BL-03', 'PA-04', null, true, 'La bolsa boutique laminada se fabrica en papel estucado.'),
  ('BL-06', 'PA-05', null, true, 'La bolsa antigrasa se fabrica en papel antigrasa.')
) as v (type_code, paper_code, caliber_code, allowed, reason)
join public.product_types pt on pt.code = v.type_code
left join public.papers pa on pa.code = v.paper_code
left join public.calibers ca on ca.code = v.caliber_code
where not exists (
  select 1 from public.compatibilities c
   where c.product_type_id = pt.id
     and c.paper_id is not distinct from pa.id
     and c.caliber_id is not distinct from ca.id
);

-- Galería: 12 muestras de referencia (fotos reales pendientes; ver E10) ------------
insert into public.gallery_samples (code, name, description, segments, product_type_id, paper_id, finish_ids, tags, sort_order, is_provisional)
select v.code, v.name, 'Muestra de referencia. Foto real pendiente de carga.', v.segments::public.segment[], pt.id, pa.id,
       coalesce((select array_agg(f.id) from public.finishes f where f.code = any (v.finish_codes)), '{}'), v.tags, v.sort_order, true
from (values
  ('M-001', 'Caja plegadiza con tapa, cartulina a 4 tintas', '{commercial}', 'CJ-01', 'PA-02', array['AC-01'], array['cosmética', 'full color'], 1),
  ('M-002', 'Caja autoarmable, cartulina a 2 tintas', '{commercial,food}', 'CJ-02', 'PA-02', array[]::text[], array['botellas'], 2),
  ('M-003', 'Mailer de envío en microcorrugado kraft', '{commercial}', 'CJ-06', 'PA-03', array[]::text[], array['e-commerce'], 3),
  ('M-004', 'Caja rígida con hot stamping', '{commercial}', 'CJ-05', 'PA-04', array['AC-05', 'AC-01'], array['premium'], 4),
  ('M-005', 'Caja gable con asa', '{commercial,food}', 'CJ-07', 'PA-02', array[]::text[], array['para llevar'], 5),
  ('M-006', 'Clamshell para hamburguesa', '{food}', 'CJ-08', 'PA-05', array[]::text[], array['comida rápida'], 6),
  ('M-007', 'Cono para papas', '{food}', 'CJ-09', 'PA-05', array[]::text[], array['comida rápida'], 7),
  ('M-008', 'Balde para pollo', '{food}', 'CJ-10', 'PA-05', array[]::text[], array['comida rápida'], 8),
  ('M-009', 'Caja para pizza en microcorrugado', '{food}', 'CJ-11', 'PA-03', array[]::text[], array['pizzería'], 9),
  ('M-010', 'Caja para torta con ventana', '{food}', 'CJ-12', 'PA-02', array['AC-07'], array['pastelería'], 10),
  ('M-011', 'Bolsa kraft con asa retorcida', '{commercial}', 'BL-02', 'PA-01', array[]::text[], array['retail'], 11),
  ('M-012', 'Bolsa boutique laminada con asa de cordón', '{commercial}', 'BL-03', 'PA-04', array['AC-01', 'AC-05'], array['premium'], 12)
) as v (code, name, segments, type_code, paper_code, finish_codes, tags, sort_order)
join public.product_types pt on pt.code = v.type_code
join public.papers pa on pa.code = v.paper_code
on conflict (code) do nothing;

-- Configuración (tabla settings) ----------------------------------------------------
insert into public.settings (key, value, value_type, description, is_public, is_provisional) values
  ('lead_time_threshold_units', '10000', 'number', 'Hasta estas unidades el plazo es de 30 días; por encima, 45 días.', true, true),
  ('lead_time_days_small', '30', 'number', 'Plazo en días para volúmenes menores.', true, false),
  ('lead_time_days_standard', '45', 'number', 'Plazo estándar en días.', true, false),
  ('deposit_pct', '50', 'number', 'Porcentaje de anticipo al aceptar la cotización.', true, false),
  ('currency', '"USD"', 'string', 'Moneda de cotizaciones y pagos.', true, true),
  ('quote_validity_days', '15', 'number', 'Vigencia de la cotización en días calendario.', true, true),
  ('max_file_mb', '100', 'number', 'Tamaño máximo por archivo de arte (MB).', true, true),
  ('max_files_per_item', '10', 'number', 'Máximo de archivos de arte por pieza.', true, true),
  ('artwork_retention_months', '24', 'number', 'Meses de retención del arte tras el último pedido.', false, true),
  ('default_margin_pct', '35', 'number', 'Margen por defecto por línea de cotización (uso interno).', false, true),
  ('show_client_logos', 'false', 'boolean', 'Mostrar logos de clientes en el sitio (requiere autorización escrita).', true, true),
  ('first_response_sla_hours', '4', 'number', 'Horas hábiles para la primera respuesta a una solicitud.', false, true),
  ('quote_sla_hours', '24', 'number', 'Horas hábiles para emitir la cotización desde la solicitud completa.', true, true),
  ('business_hours', '{"timezone": "America/Panama", "days": [1, 2, 3, 4, 5], "start": "08:00", "end": "17:00"}', 'json', 'Horario hábil para contar SLA.', false, true),
  ('quote_expiry_reminder_days', '[3, 1]', 'json', 'Días antes del vencimiento para recordar la cotización.', false, true),
  ('balance_reminder_days', '[2, 5]', 'json', 'Días después de la entrega para recordar el saldo.', false, true),
  ('nps_delay_days', '7', 'number', 'Días después de la entrega para enviar la encuesta NPS.', false, true)
on conflict (key) do nothing;
