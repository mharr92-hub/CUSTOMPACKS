import { annotateCalibers, annotatePapers } from "@/lib/compat";
import type { Segment } from "./entities";
import type { PublicCatalog, PublicCategory, PublicProductType } from "./public";

/** Segmentos en la URL pública (en español) ↔ valores internos. */
export const SEGMENT_SLUGS = { comercio: "commercial", alimentos: "food" } as const satisfies Record<string, Segment>;
export type SegmentSlug = keyof typeof SEGMENT_SLUGS;

export function segmentFromSlug(value: string | string[] | undefined): Segment | null {
  if (typeof value !== "string") return null;
  return (SEGMENT_SLUGS as Record<string, Segment | undefined>)[value] ?? null;
}

export function slugFromSegment(segment: Segment): SegmentSlug {
  return segment === "commercial" ? "comercio" : "alimentos";
}

export function productHref(category: Pick<PublicCategory, "slug">, type: Pick<PublicProductType, "slug">): string {
  return `/catalogo/${category.slug}/${type.slug}`;
}

export function quoteHref(type?: Pick<PublicProductType, "code"> | null): string {
  return type ? `/cotizar?tipo=${encodeURIComponent(type.code)}` : "/cotizar";
}

export function categoryById(catalog: PublicCatalog, id: string): PublicCategory | undefined {
  return catalog.categories.find((c) => c.id === id);
}

/** Tipos activos cuya categoría también está activa (evita enlaces rotos). */
export function visibleTypes(catalog: PublicCatalog): Array<PublicProductType & { category: PublicCategory }> {
  return catalog.productTypes.flatMap((type) => {
    const category = categoryById(catalog, type.categoryId);
    return category ? [{ ...type, category }] : [];
  });
}

export function findType(catalog: PublicCatalog, categorySlug: string, typeSlug: string) {
  return visibleTypes(catalog).find((t) => t.category.slug === categorySlug && t.slug === typeSlug) ?? null;
}

export function sizesForType(catalog: PublicCatalog, type: PublicProductType) {
  return catalog.sizes.filter((s) => s.family === type.sizeFamily);
}

/** Papeles y calibres válidos para el tipo, y los motivos de las reglas que lo afectan. */
export function materialsForType(catalog: PublicCatalog, type: PublicProductType) {
  const papers = annotatePapers(catalog.compatibilities, type.id, catalog.papers).filter((p) => p.decision.allowed);
  const calibers = annotateCalibers(catalog.compatibilities, type.id, null, catalog.calibers).filter((c) => c.decision.allowed);
  const reasons = [
    ...new Set(
      catalog.compatibilities
        .filter((r) => r.productTypeId === type.id && r.reason)
        .map((r) => r.reason as string),
    ),
  ];
  return { papers, calibers, reasons };
}

/** Número con separador de miles del español de Panamá (10.000). */
export function formatInt(value: number): string {
  return new Intl.NumberFormat("es-PA").format(value);
}

export function formatCm(value: number): string {
  return new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(value);
}
