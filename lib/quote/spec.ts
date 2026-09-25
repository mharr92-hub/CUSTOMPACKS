import type { ProductCondition } from "@/lib/catalog/entities";
import type { PublicCatalog } from "@/lib/catalog/public";
import type { TrafficItemInput } from "@/lib/traffic-light";
import { parseCm, parsePantoneCodes, parseQuantity, parseWeightGrams, itemHasPrinting } from "./validate";
import type { ArtworkChoice, Frequency, ItemDraft, PrintCoverage, PrintFaces, ProductUse, SizeMode, WizardState } from "./types";

/**
 * Ficha técnica normalizada de una pieza. Se congela en
 * quote_items.spec_snapshot al enviar, así el resumen, el seguimiento, el PDF y
 * el RFQ muestran lo mismo aunque el catálogo cambie después.
 */
export type Named = { id: string; code: string; name: string };
export type Dims = { l: number; w: number; h: number };

export type ItemSpec = {
  position: number;
  needsAdvice: boolean;
  category: Named | null;
  type: Named | null;
  size: { mode: SizeMode | null; standard: (Named & Dims) | null; custom: Dims | null };
  materialAdvice: boolean;
  paper: Named | null;
  caliber: Named | null;
  eco: Named[];
  food: Named[];
  print: { option: Named | null; noPrint: boolean; pantone: string[]; faces: PrintFaces | null; coverage: PrintCoverage | null };
  finishes: Named[];
  product: {
    name: string;
    contents: string;
    weightG: number | null;
    dims: Dims | null;
    volume: string;
    conditions: ProductCondition[];
    uses: ProductUse[];
  };
  quantities: number[];
  frequency: Frequency | null;
  artwork: ArtworkChoice | "not_applicable" | null;
  artworkFileCount: number;
  references: { links: string[]; samples: Named[]; photoCount: number };
};

function named<T extends { id: string; code: string; name: string }>(list: readonly T[], id: string | null): Named | null {
  const found = id ? list.find((x) => x.id === id) : undefined;
  return found ? { id: found.id, code: found.code, name: found.name } : null;
}

function namedMany<T extends { id: string; code: string; name: string }>(list: readonly T[], ids: readonly string[]): Named[] {
  return ids.flatMap((id) => {
    const n = named(list, id);
    return n ? [n] : [];
  });
}

function dims(l: string, w: string, h: string): Dims | null {
  const [a, b, c] = [parseCm(l), parseCm(w), parseCm(h)];
  return typeof a === "number" && typeof b === "number" && typeof c === "number" ? { l: a, w: b, h: c } : null;
}

export function itemSpecFromDraft(item: ItemDraft, index: number, state: WizardState, catalog: PublicCatalog): ItemSpec {
  const size = item.standardSizeId ? catalog.sizes.find((s) => s.id === item.standardSizeId) : undefined;
  const print = named(catalog.printOptions, item.printOptionId);
  const printOpt = catalog.printOptions.find((p) => p.id === item.printOptionId);
  const pantone = parsePantoneCodes(item.pantone);
  const weight = parseWeightGrams(state.product.weight, state.product.weightUnit);
  const hasPrinting = itemHasPrinting(item, catalog);
  const advice = item.needsAdvice;
  return {
    position: index + 1,
    needsAdvice: advice,
    category: named(catalog.categories, item.categoryId),
    type: advice ? null : named(catalog.productTypes, item.productTypeId),
    size: advice
      ? { mode: null, standard: null, custom: null }
      : {
          mode: item.sizeMode,
          standard: item.sizeMode === "standard" && size ? { id: size.id, code: size.code, name: size.name, l: size.lengthCm, w: size.widthCm, h: size.heightCm } : null,
          custom: item.sizeMode === "custom" ? dims(item.length, item.width, item.height) : null,
        },
    materialAdvice: !advice && item.materialAdvice,
    paper: advice || item.materialAdvice ? null : named(catalog.papers, item.paperId),
    caliber: advice || item.materialAdvice ? null : named(catalog.calibers, item.caliberId),
    eco: advice ? [] : namedMany(catalog.ecoAttributes, item.ecoIds),
    food: advice ? [] : namedMany(catalog.foodAttributes, item.foodIds),
    print: {
      option: advice ? null : print,
      noPrint: Boolean(printOpt?.isNoPrint),
      pantone: !advice && printOpt?.requiresPantone && Array.isArray(pantone) ? pantone : [],
      faces: hasPrinting ? item.faces : null,
      coverage: hasPrinting ? item.coverage : null,
    },
    finishes: advice ? [] : namedMany(catalog.finishes, item.finishIds),
    product: {
      name: state.product.name.trim(),
      contents: state.product.contents.trim(),
      weightG: typeof weight === "number" ? weight : null,
      dims: dims(state.product.length, state.product.width, state.product.height),
      volume: state.product.volume.trim(),
      conditions: state.product.conditions,
      uses: state.product.uses,
    },
    quantities: item.quantities.map(parseQuantity).filter((q): q is number => typeof q === "number"),
    frequency: item.frequency,
    artwork: hasPrinting ? item.artwork : "not_applicable",
    artworkFileCount: item.artworkFiles.length,
    references: {
      links: item.referenceLinks.map((l) => l.trim()).filter(Boolean),
      samples: namedMany(catalog.gallery, item.referenceSampleIds),
      photoCount: item.referencePhotos.length,
    },
  };
}

/** Entrada del semáforo a partir de la ficha. */
export function trafficInputFromSpec(spec: ItemSpec): TrafficItemInput {
  return {
    hasType: !spec.needsAdvice && spec.type !== null,
    quantityCount: spec.quantities.length,
    hasPrinting: spec.artwork !== "not_applicable" && !spec.needsAdvice,
    artworkFileCount: spec.artworkFileCount,
    artworkChoice: spec.artwork === "not_applicable" ? null : spec.artwork,
    hasWeight: spec.product.weightG !== null,
    hasProductDimensions: spec.product.dims !== null || spec.product.volume !== "",
    referenceCount: spec.references.links.length + spec.references.samples.length + spec.references.photoCount,
  };
}

// ---------------------------------------------------------------------------
// Filas "etiqueta: valor" para mostrar la ficha (resumen, seguimiento, PDF, RFQ)
// ---------------------------------------------------------------------------
export type SpecTranslator = (key: string, values?: Record<string, string | number>) => string;
export type SpecRow = { label: string; value: string };

const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);
const fmtCm = (n: number) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(n);
const fmtDims = (d: Dims) => `${fmtCm(d.l)} × ${fmtCm(d.w)} × ${fmtCm(d.h)} cm`;
const withCode = (n: Named) => `${n.code} · ${n.name}`;

/**
 * @param t traductor del namespace `spec` de messages/es.json
 */
export function specRows(spec: ItemSpec, t: SpecTranslator): SpecRow[] {
  const none = t("none");
  const list = (items: Named[]) => (items.length ? items.map((i) => i.name).join(", ") : none);
  const rows: SpecRow[] = [];
  rows.push({ label: t("type"), value: spec.needsAdvice || !spec.type ? t("typeAdvice") : withCode(spec.type) });
  if (spec.category) rows.push({ label: t("category"), value: spec.category.name });

  let size = none;
  if (spec.size.mode === "standard" && spec.size.standard) size = t("sizeStandard", { name: spec.size.standard.name, dims: fmtDims(spec.size.standard) });
  else if (spec.size.mode === "custom" && spec.size.custom) size = t("sizeCustom", { dims: fmtDims(spec.size.custom) });
  else if (spec.size.mode === "by_product") size = t("sizeByProduct");
  else if (spec.needsAdvice) size = t("advice");
  rows.push({ label: t("size"), value: size });

  if (spec.materialAdvice || spec.needsAdvice) {
    rows.push({ label: t("material"), value: t("materialAdvice") });
  } else {
    rows.push({ label: t("paper"), value: spec.paper ? withCode(spec.paper) : none });
    rows.push({ label: t("caliber"), value: spec.caliber ? withCode(spec.caliber) : none });
  }
  rows.push({ label: t("eco"), value: list(spec.eco) });
  rows.push({ label: t("food"), value: list(spec.food) });

  const printName = spec.print.option ? withCode(spec.print.option) : spec.needsAdvice ? t("advice") : none;
  rows.push({ label: t("print"), value: spec.print.pantone.length ? `${printName} (${spec.print.pantone.join(", ")})` : printName });
  if (spec.print.faces) rows.push({ label: t("faces"), value: t(`facesOptions.${spec.print.faces}`) });
  if (spec.print.coverage) rows.push({ label: t("coverage"), value: t(`coverageOptions.${spec.print.coverage}`) });
  rows.push({ label: t("finishes"), value: list(spec.finishes) });

  const p = spec.product;
  rows.push({ label: t("product"), value: [p.name, p.contents].filter(Boolean).join(" — ") || none });
  rows.push({ label: t("weight"), value: p.weightG !== null ? t("weightValue", { grams: fmtInt(Math.round(p.weightG)) }) : none });
  rows.push({ label: t("productDims"), value: p.dims ? fmtDims(p.dims) : p.volume || none });
  rows.push({ label: t("conditions"), value: p.conditions.length ? p.conditions.map((c) => t(`conditionOptions.${c}`)).join(", ") : none });
  rows.push({ label: t("uses"), value: p.uses.length ? p.uses.map((u) => t(`useOptions.${u}`)).join(", ") : none });

  rows.push({ label: t("quantities"), value: spec.quantities.length ? spec.quantities.map(fmtInt).join(" / ") : none });
  rows.push({ label: t("frequency"), value: spec.frequency ? t(`frequencyOptions.${spec.frequency}`) : none });

  const artwork = spec.artwork ? t(`artworkOptions.${spec.artwork}`) : none;
  rows.push({ label: t("artwork"), value: spec.artworkFileCount ? t("artworkFiles", { label: artwork, count: spec.artworkFileCount }) : artwork });

  const refs = [
    ...spec.references.samples.map((s) => s.code),
    ...spec.references.links,
    ...(spec.references.photoCount ? [t("referencePhotos", { count: spec.references.photoCount })] : []),
  ];
  rows.push({ label: t("references"), value: refs.length ? refs.join(", ") : none });
  return rows;
}
