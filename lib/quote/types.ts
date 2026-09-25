import type { ProductCondition } from "@/lib/catalog/entities";

/**
 * Estado del cotizador (se guarda tal cual en quote_drafts.payload y en
 * localStorage como respaldo). Todas las selecciones se guardan por id de
 * catálogo; los nombres y códigos se congelan al enviar (spec_snapshot).
 */
export const WIZARD_VERSION = 1;

/** Pasos del PRD §8. */
export const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type StepId = (typeof STEPS)[number];

export type WizardSegment = "commercial" | "food" | "unsure";
export type WeightUnit = "g" | "kg";
export type ProductUse = "display" | "shipping" | "delivery" | "event" | "gift";
export type SizeMode = "standard" | "custom" | "by_product";
export type PrintFaces = "outside" | "inside" | "both";
export type PrintCoverage = "logo" | "partial" | "full";
export type Frequency = "once" | "monthly" | "quarterly" | "seasonal";
export type ArtworkChoice = "has_artwork" | "no_artwork_yet" | "needs_design";

export const PRODUCT_USES: readonly ProductUse[] = ["display", "shipping", "delivery", "event", "gift"];
export const PRINT_FACES: readonly PrintFaces[] = ["outside", "inside", "both"];
export const PRINT_COVERAGES: readonly PrintCoverage[] = ["logo", "partial", "full"];
export const FREQUENCIES: readonly Frequency[] = ["once", "monthly", "quarterly", "seasonal"];
export const ARTWORK_CHOICES: readonly ArtworkChoice[] = ["has_artwork", "no_artwork_yet", "needs_design"];
export const LEAD_SOURCES = ["search", "social", "meta_ads", "whatsapp", "referral", "event", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Número como texto tal como lo escribe la persona (se valida y convierte al enviar). */
export type NumText = string;

export type ProductInfo = {
  name: string;
  contents: string;
  weight: NumText;
  weightUnit: WeightUnit;
  length: NumText;
  width: NumText;
  height: NumText;
  volume: string;
  conditions: ProductCondition[];
  uses: ProductUse[];
};

/** Archivo de arte o foto de referencia ya subido (lo completa E4). */
export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  path: string;
  kind: string;
};

export type ItemDraft = {
  key: string;
  categoryId: string | null;
  productTypeId: string | null;
  needsAdvice: boolean;
  sizeMode: SizeMode | null;
  standardSizeId: string | null;
  length: NumText;
  width: NumText;
  height: NumText;
  /** "No sé, asesórenme" en el paso de material: papel y calibre quedan a propuesta del equipo. */
  materialAdvice: boolean;
  paperId: string | null;
  caliberId: string | null;
  ecoIds: string[];
  foodIds: string[];
  printOptionId: string | null;
  pantone: string;
  faces: PrintFaces | null;
  coverage: PrintCoverage | null;
  finishIds: string[];
  quantities: [NumText, NumText, NumText];
  frequency: Frequency | null;
  artwork: ArtworkChoice | null;
  artworkFiles: UploadedFile[];
  referenceLinks: string[];
  referenceSampleIds: string[];
  referencePhotos: UploadedFile[];
};

export type ContactInfo = {
  company: string;
  ruc: string;
  name: string;
  position: string;
  whatsapp: string;
  email: string;
  city: string;
  address: string;
  source: LeadSource | "";
  comments: string;
  consent: boolean;
};

export type WizardState = {
  version: typeof WIZARD_VERSION;
  step: StepId;
  /** Pieza que se está editando en los pasos 2 a 5. */
  current: number;
  segment: WizardSegment | null;
  product: ProductInfo;
  items: ItemDraft[];
  desiredDate: string;
  contact: ContactInfo;
  utm: Record<string, string>;
  referrer: string;
  startedAt: string;
};

let keyCounter = 0;
export function newItemKey(): string {
  keyCounter += 1;
  return `p${Date.now().toString(36)}${keyCounter}`;
}

export function emptyItem(key: string = newItemKey()): ItemDraft {
  return {
    key,
    categoryId: null,
    productTypeId: null,
    needsAdvice: false,
    sizeMode: null,
    standardSizeId: null,
    length: "",
    width: "",
    height: "",
    materialAdvice: false,
    paperId: null,
    caliberId: null,
    ecoIds: [],
    foodIds: [],
    printOptionId: null,
    pantone: "",
    faces: null,
    coverage: null,
    finishIds: [],
    quantities: ["", "", ""],
    frequency: null,
    artwork: null,
    artworkFiles: [],
    referenceLinks: [],
    referenceSampleIds: [],
    referencePhotos: [],
  };
}

export function initialWizardState(now: Date = new Date()): WizardState {
  return {
    version: WIZARD_VERSION,
    step: 0,
    current: 0,
    segment: null,
    product: {
      name: "",
      contents: "",
      weight: "",
      weightUnit: "g",
      length: "",
      width: "",
      height: "",
      volume: "",
      conditions: [],
      uses: [],
    },
    items: [emptyItem("p1")],
    desiredDate: "",
    contact: {
      company: "",
      ruc: "",
      name: "",
      position: "",
      whatsapp: "",
      email: "",
      city: "",
      address: "",
      source: "",
      comments: "",
      consent: false,
    },
    utm: {},
    referrer: "",
    startedAt: now.toISOString(),
  };
}
