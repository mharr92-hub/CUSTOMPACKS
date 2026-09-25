import type { PublicCatalog } from "@/lib/catalog/public";
import type { ItemSpec } from "@/lib/quote/spec";
import { emptyItem, initialWizardState, type ItemDraft, type WizardState } from "@/lib/quote/types";

/**
 * "Pedir de nuevo" (PRD §10): arma el cotizador con las piezas del pedido
 * anterior y la cantidad que se pidió. Solo se toman opciones que siguen
 * activas en el catálogo; los archivos no se copian (el arte aprobado queda en
 * el pedido anterior y el comentario lo referencia). Abre en el resumen.
 */
export type ReorderSource = {
  segment: WizardState["segment"];
  company: string | null;
  contactName: string;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  address: string | null;
  comment: string;
  lines: { position: number; quantity: number; spec: ItemSpec }[];
};

const idIn = (list: readonly { id: string }[], id: string | null | undefined): string | null => (id && list.some((x) => x.id === id) ? id : null);
const idsIn = (list: readonly { id: string }[], items: readonly { id: string }[]): string[] => items.map((i) => i.id).filter((id) => list.some((x) => x.id === id));
const cm = (n: number | undefined) => (typeof n === "number" ? String(n) : "");

function itemFromSpec(spec: ItemSpec, quantity: number, catalog: PublicCatalog, index: number): ItemDraft {
  const item = emptyItem(`r${index + 1}`);
  const typeId = idIn(catalog.productTypes, spec.type?.id);
  const standard = idIn(catalog.sizes, spec.size.standard?.id);
  const custom = spec.size.custom;
  return {
    ...item,
    categoryId: idIn(catalog.categories, spec.category?.id),
    productTypeId: typeId,
    needsAdvice: spec.needsAdvice,
    sizeMode: spec.size.mode === "standard" && !standard ? null : spec.size.mode,
    standardSizeId: standard,
    length: cm(custom?.l),
    width: cm(custom?.w),
    height: cm(custom?.h),
    materialAdvice: spec.materialAdvice,
    paperId: idIn(catalog.papers, spec.paper?.id),
    caliberId: idIn(catalog.calibers, spec.caliber?.id),
    ecoIds: idsIn(catalog.ecoAttributes, spec.eco),
    foodIds: idsIn(catalog.foodAttributes, spec.food),
    printOptionId: idIn(catalog.printOptions, spec.print.option?.id),
    pantone: spec.print.pantone.join(", "),
    faces: spec.print.faces,
    coverage: spec.print.coverage,
    finishIds: idsIn(catalog.finishes, spec.finishes),
    quantities: [String(quantity), "", ""],
    frequency: spec.frequency,
    artwork: spec.artwork === "not_applicable" ? null : spec.artwork,
    referenceLinks: [...spec.references.links],
    referenceSampleIds: idsIn(catalog.gallery, spec.references.samples),
  };
}

export function reorderState(source: ReorderSource, catalog: PublicCatalog, now: Date = new Date()): WizardState {
  const base = initialWizardState(now);
  const lines = [...source.lines].sort((a, b) => a.position - b.position).slice(0, 20);
  const product = lines[0]?.spec.product;
  return {
    ...base,
    step: 9,
    current: 0,
    segment: source.segment,
    product: product
      ? {
          name: product.name,
          contents: product.contents,
          weight: product.weightG === null ? "" : String(product.weightG),
          weightUnit: "g",
          length: cm(product.dims?.l),
          width: cm(product.dims?.w),
          height: cm(product.dims?.h),
          volume: product.volume,
          conditions: [...product.conditions],
          uses: [...product.uses],
        }
      : base.product,
    items: lines.length ? lines.map((l, i) => itemFromSpec(l.spec, l.quantity, catalog, i)) : base.items,
    contact: {
      ...base.contact,
      company: source.company ?? "",
      name: source.contactName,
      email: source.email ?? "",
      whatsapp: source.whatsapp ?? "",
      city: source.city ?? "",
      address: source.address ?? "",
      comments: source.comment,
      consent: false,
    },
  };
}
