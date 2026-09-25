import "server-only";
import { unstable_cache } from "next/cache";
import type { CompatRule } from "@/lib/compat";
import { anonActor, withActor } from "@/lib/db/actor";
import { DEFAULT_LEAD_TIME, type LeadTimeSettings } from "@/lib/leadtime";
import type { ProductCondition, Segment, SizeFamily } from "./entities";

/**
 * Catálogo público (solo opciones activas, leído como `anon` para que RLS
 * garantice que nada inactivo o interno se filtre). Se cachea con la etiqueta
 * `catalog`; las acciones del panel la invalidan al guardar.
 */
export const CATALOG_TAG = "catalog";

type Base = { id: string; code: string; name: string; description: string | null; photoUrl: string | null; sortOrder: number };

export type PublicCategory = Base & { slug: string };
export type PublicProductType = Base & {
  slug: string;
  categoryId: string;
  segments: Segment[];
  sizeFamily: SizeFamily;
  typicalUses: string[];
  photos: string[];
};
export type PublicSize = Base & { family: SizeFamily; lengthCm: number; widthCm: number; heightCm: number };
export type PublicPaper = Base & { isBarrier: boolean; suggestedForConditions: ProductCondition[] };
export type PublicCaliber = Base & {
  simpleLabel: string | null;
  grammageGsm: number | null;
  points: number | null;
  minWeightG: number | null;
  maxWeightG: number | null;
};
export type PublicPrintOption = Base & { inkCount: number | null; requiresPantone: boolean; isNoPrint: boolean };
export type PublicFinish = Base;
export type PublicEcoAttribute = Base & { showBadge: boolean };
export type PublicFoodAttribute = Base & { suggestedForConditions: ProductCondition[] };
export type PublicGallerySample = Base & {
  photos: string[];
  segments: Segment[];
  productTypeId: string | null;
  paperId: string | null;
  finishIds: string[];
  tags: string[];
};

export type PublicCatalog = {
  categories: PublicCategory[];
  productTypes: PublicProductType[];
  sizes: PublicSize[];
  papers: PublicPaper[];
  calibers: PublicCaliber[];
  printOptions: PublicPrintOption[];
  finishes: PublicFinish[];
  ecoAttributes: PublicEcoAttribute[];
  foodAttributes: PublicFoodAttribute[];
  gallery: PublicGallerySample[];
  compatibilities: CompatRule[];
  settings: Record<string, unknown>;
};

type Row = Record<string, unknown>;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function base(r: Row): Base {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    photoUrl: (r.photo_url as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

async function loadCatalog(): Promise<PublicCatalog> {
  return withActor(anonActor, async (tx) => {
    const order = tx`order by sort_order, name`;
    const [categories, types, sizes, papers, calibers, prints, finishes, eco, food, gallery, compat, settings] = await Promise.all([
      tx<Row[]>`select id, code, slug, name, description, photo_url, sort_order from public.categories where is_active ${order}`,
      tx<Row[]>`select id, code, slug, name, description, photo_url, photos, category_id, segments, size_family, typical_uses, sort_order from public.product_types where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, family, length_cm, width_cm, height_cm, sort_order from public.standard_sizes where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, is_barrier, suggested_for_conditions, sort_order from public.papers where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, simple_label, grammage_gsm, points, min_weight_g, max_weight_g, sort_order from public.calibers where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, ink_count, requires_pantone, is_no_print, sort_order from public.print_options where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, sort_order from public.finishes where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, show_badge, sort_order from public.eco_attributes where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, suggested_for_conditions, sort_order from public.food_attributes where is_active ${order}`,
      tx<Row[]>`select id, code, name, description, photo_url, photos, segments, product_type_id, paper_id, finish_ids, tags, sort_order from public.gallery_samples where is_active ${order}`,
      tx<Row[]>`select product_type_id, paper_id, caliber_id, allowed, reason from public.compatibilities where is_active`,
      tx<Row[]>`select key, value from public.settings where is_public`,
    ]);
    return {
      categories: categories.map((r) => ({ ...base(r), slug: r.slug as string })),
      productTypes: types.map((r) => ({
        ...base(r),
        slug: r.slug as string,
        categoryId: r.category_id as string,
        segments: r.segments as Segment[],
        sizeFamily: r.size_family as SizeFamily,
        typicalUses: r.typical_uses as string[],
        photos: r.photos as string[],
      })),
      sizes: sizes.map((r) => ({
        ...base(r),
        family: r.family as SizeFamily,
        lengthCm: Number(r.length_cm),
        widthCm: Number(r.width_cm),
        heightCm: Number(r.height_cm),
      })),
      papers: papers.map((r) => ({
        ...base(r),
        isBarrier: Boolean(r.is_barrier),
        suggestedForConditions: r.suggested_for_conditions as ProductCondition[],
      })),
      calibers: calibers.map((r) => ({
        ...base(r),
        simpleLabel: (r.simple_label as string | null) ?? null,
        grammageGsm: num(r.grammage_gsm),
        points: num(r.points),
        minWeightG: num(r.min_weight_g),
        maxWeightG: num(r.max_weight_g),
      })),
      printOptions: prints.map((r) => ({
        ...base(r),
        inkCount: num(r.ink_count),
        requiresPantone: Boolean(r.requires_pantone),
        isNoPrint: Boolean(r.is_no_print),
      })),
      finishes: finishes.map(base),
      ecoAttributes: eco.map((r) => ({ ...base(r), showBadge: Boolean(r.show_badge) })),
      foodAttributes: food.map((r) => ({ ...base(r), suggestedForConditions: r.suggested_for_conditions as ProductCondition[] })),
      gallery: gallery.map((r) => ({
        ...base(r),
        photos: r.photos as string[],
        segments: r.segments as Segment[],
        productTypeId: (r.product_type_id as string | null) ?? null,
        paperId: (r.paper_id as string | null) ?? null,
        finishIds: r.finish_ids as string[],
        tags: r.tags as string[],
      })),
      compatibilities: compat.map((r) => ({
        productTypeId: r.product_type_id as string,
        paperId: (r.paper_id as string | null) ?? null,
        caliberId: (r.caliber_id as string | null) ?? null,
        allowed: Boolean(r.allowed),
        reason: (r.reason as string | null) ?? null,
      })),
      settings: Object.fromEntries(settings.map((r) => [r.key as string, r.value])),
    };
  });
}

/** Catálogo público cacheado (5 min o hasta que el panel lo invalide). */
export const getPublicCatalog = unstable_cache(loadCatalog, ["public-catalog-v1"], {
  tags: [CATALOG_TAG],
  revalidate: 300,
});

/** Lectura de una configuración pública con valor por defecto. */
export function publicSetting<T>(catalog: PublicCatalog, key: string, fallback: T): T {
  const value = catalog.settings[key];
  return value === undefined || value === null ? fallback : (value as T);
}

/** Leyenda de impuestos junto a precios y montos (settings.tax_label, p. ej. "más ITBMS 7 %"). */
export function taxLabel(catalog: PublicCatalog): string {
  const value = publicSetting(catalog, "tax_label", "");
  return typeof value === "string" ? value.trim() : "";
}

/** Límites de subida de arte (settings): MB por archivo y archivos por pieza (PRD §9). */
export function uploadSettings(catalog: PublicCatalog): { maxMb: number; maxFiles: number } {
  return { maxMb: publicSetting(catalog, "max_file_mb", 100), maxFiles: publicSetting(catalog, "max_files_per_item", 10) };
}

/** Condiciones comerciales vigentes (settings): plazo por cantidad y anticipo. */
export function quoteConditions(catalog: PublicCatalog): { leadTime: LeadTimeSettings; depositPct: number } {
  return {
    leadTime: {
      thresholdUnits: publicSetting(catalog, "lead_time_threshold_units", DEFAULT_LEAD_TIME.thresholdUnits),
      smallDays: publicSetting(catalog, "lead_time_days_small", DEFAULT_LEAD_TIME.smallDays),
      standardDays: publicSetting(catalog, "lead_time_days_standard", DEFAULT_LEAD_TIME.standardDays),
    },
    depositPct: publicSetting(catalog, "deposit_pct", 50),
  };
}
