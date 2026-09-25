import { evaluateCaliber, evaluatePaper } from "@/lib/compat";
import type { PublicCatalog } from "@/lib/catalog/public";
import { todayInPanama } from "@/lib/leadtime";
import type { ItemDraft, StepId, WizardState } from "./types";

/**
 * Validación del cotizador: funciones puras que usan el navegador (mensajes
 * paso a paso) y el servidor (antes de guardar la solicitud). Cada error es una
 * clave de messages/es.json > wizard.errors que dice qué corregir.
 */
export type ErrorKey =
  | "segmentRequired"
  | "productNameRequired"
  | "weightInvalid"
  | "dimsIncomplete"
  | "cmInvalid"
  | "typeRequired"
  | "typeInvalid"
  | "sizeModeRequired"
  | "standardSizeRequired"
  | "paperRequired"
  | "paperNotAllowed"
  | "caliberRequired"
  | "caliberNotAllowed"
  | "foodRequired"
  | "printRequired"
  | "pantoneRequired"
  | "pantoneInvalid"
  | "facesRequired"
  | "coverageRequired"
  | "quantityRequired"
  | "quantityInvalid"
  | "frequencyRequired"
  | "dateInPast"
  | "dateInvalid"
  | "artworkRequired"
  | "linkInvalid"
  | "nameRequired"
  | "contactRequired"
  | "emailInvalid"
  | "whatsappInvalid"
  | "cityRequired"
  | "addressRequired"
  | "consentRequired";

export type StepErrors = Record<string, ErrorKey>;

// ---------------------------------------------------------------------------
// Parsers de campos (aceptan formatos habituales en Panamá)
// ---------------------------------------------------------------------------

/** Decimal con coma o punto. null si está vacío; NaN si no es un número. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return Number.NaN;
  return Number(t.replace(",", "."));
}

/** Medida en cm: mayor que 0 y con un decimal como máximo. */
export function parseCm(text: string): number | null | "invalid" {
  const t = text.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^\d{1,4}([.,]\d)?$/.test(t)) return "invalid";
  const n = Number(t.replace(",", "."));
  return n > 0 ? n : "invalid";
}

/** Cantidad entera > 0. Acepta separadores de miles: 10.000, 10,000 o 10 000. */
export function parseQuantity(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  if (/^\d+$/.test(t) || /^\d{1,3}([.,\s]\d{3})+$/.test(t)) {
    const n = Number(t.replace(/[.,\s]/g, ""));
    return Number.isSafeInteger(n) && n > 0 ? n : "invalid";
  }
  return "invalid";
}

/** Peso en gramos a partir del texto y la unidad. */
export function parseWeightGrams(text: string, unit: "g" | "kg"): number | null | "invalid" {
  const n = parseDecimal(text);
  if (n === null) return null;
  if (!Number.isFinite(n) || n <= 0) return "invalid";
  return unit === "kg" ? n * 1000 : n;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(text: string): boolean {
  return EMAIL.test(text.trim());
}

/** WhatsApp con código de país: +507 6123-4567 o 00507… (8 a 15 dígitos en total). */
export function normalizeWhatsapp(text: string): string | null {
  const t = text.trim();
  if (!/^(\+|00)/.test(t) || /[^\d\s+()-]/.test(t)) return null;
  const digits = t.replace(/^00/, "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

/** Códigos Pantone separados por coma: número de 3–4 cifras + C o U (p. ej. "186 C, 7621U"). */
export function parsePantoneCodes(text: string): string[] | "invalid" {
  const parts = text
    .split(/[,;/]+/)
    .map((p) => p.trim().toUpperCase().replace(/^PANTONE\s*/, ""))
    .filter(Boolean);
  if (parts.length === 0) return [];
  const out: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(\d{3,4})\s?([CU])$/);
    if (!m) return "invalid";
    out.push(`${m[1]} ${m[2]}`);
  }
  return out;
}

export function isValidUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Validación por paso
// ---------------------------------------------------------------------------
export type ValidationContext = { catalog: PublicCatalog; today?: string };

function printOption(catalog: PublicCatalog, id: string | null) {
  return id ? (catalog.printOptions.find((p) => p.id === id) ?? null) : null;
}

/** true si la pieza lleva impresión (y por lo tanto necesita arte). */
export function itemHasPrinting(item: ItemDraft, catalog: PublicCatalog): boolean {
  if (item.needsAdvice) return false;
  const opt = printOption(catalog, item.printOptionId);
  return Boolean(opt && !opt.isNoPrint);
}

export function validateProduct(state: WizardState): StepErrors {
  const e: StepErrors = {};
  const p = state.product;
  if (!p.name.trim()) e["product.name"] = "productNameRequired";
  if (parseWeightGrams(p.weight, p.weightUnit) === "invalid") e["product.weight"] = "weightInvalid";
  const dims = [p.length, p.width, p.height].map(parseCm);
  const filled = dims.filter((d) => d !== null).length;
  dims.forEach((d, i) => {
    if (d === "invalid") e[`product.${["length", "width", "height"][i]}`] = "cmInvalid";
  });
  if (filled > 0 && filled < 3 && !e["product.length"] && !e["product.width"] && !e["product.height"]) e["product.dims"] = "dimsIncomplete";
  return e;
}

export function validateItemType(item: ItemDraft, ctx: ValidationContext): StepErrors {
  if (item.needsAdvice) return {};
  if (!item.productTypeId) return { type: "typeRequired" };
  const type = ctx.catalog.productTypes.find((t) => t.id === item.productTypeId);
  if (!type) return { type: "typeInvalid" };
  return {};
}

export function validateItemSize(item: ItemDraft, ctx: ValidationContext): StepErrors {
  if (item.needsAdvice) return {};
  const e: StepErrors = {};
  if (!item.sizeMode) return { size: "sizeModeRequired" };
  if (item.sizeMode === "standard") {
    const type = ctx.catalog.productTypes.find((t) => t.id === item.productTypeId);
    const size = ctx.catalog.sizes.find((s) => s.id === item.standardSizeId);
    if (!size || (type && size.family !== type.sizeFamily)) e.standardSize = "standardSizeRequired";
  }
  if (item.sizeMode === "custom") {
    (["length", "width", "height"] as const).forEach((k) => {
      const v = parseCm(item[k]);
      if (v === null || v === "invalid") e[k] = "cmInvalid";
    });
  }
  return e;
}

export function validateItemMaterial(item: ItemDraft, segment: WizardState["segment"], ctx: ValidationContext): StepErrors {
  if (item.needsAdvice) return {};
  const e: StepErrors = {};
  const rules = ctx.catalog.compatibilities;
  if (!item.materialAdvice) {
    if (!item.paperId) e.paper = "paperRequired";
    else if (!ctx.catalog.papers.some((p) => p.id === item.paperId) || (item.productTypeId && !evaluatePaper(rules, item.productTypeId, item.paperId).allowed)) {
      e.paper = "paperNotAllowed";
    }
    if (!item.caliberId) e.caliber = "caliberRequired";
    else if (
      !ctx.catalog.calibers.some((c) => c.id === item.caliberId) ||
      (item.productTypeId && !evaluateCaliber(rules, item.productTypeId, item.paperId, item.caliberId).allowed)
    ) {
      e.caliber = "caliberNotAllowed";
    }
  }
  if (segment === "food" && item.foodIds.length === 0) e.food = "foodRequired";
  return e;
}

export function validateItemPrint(item: ItemDraft, ctx: ValidationContext): StepErrors {
  if (item.needsAdvice) return {};
  const e: StepErrors = {};
  const opt = printOption(ctx.catalog, item.printOptionId);
  if (!opt) return { print: "printRequired" };
  if (opt.requiresPantone) {
    const codes = parsePantoneCodes(item.pantone);
    if (codes === "invalid") e.pantone = "pantoneInvalid";
    else if (codes.length === 0) e.pantone = "pantoneRequired";
  }
  if (!opt.isNoPrint) {
    if (!item.faces) e.faces = "facesRequired";
    if (!item.coverage) e.coverage = "coverageRequired";
  }
  return e;
}

export function validateQuantities(state: WizardState, today: string): StepErrors {
  const e: StepErrors = {};
  state.items.forEach((item, i) => {
    const parsed = item.quantities.map(parseQuantity);
    parsed.forEach((q, j) => {
      if (q === "invalid") e[`items.${i}.quantities.${j}`] = "quantityInvalid";
    });
    if (parsed.every((q) => q === null)) e[`items.${i}.quantities`] = "quantityRequired";
    if (!item.frequency) e[`items.${i}.frequency`] = "frequencyRequired";
  });
  if (state.desiredDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.desiredDate)) e.desiredDate = "dateInvalid";
    else if (state.desiredDate < today) e.desiredDate = "dateInPast";
  }
  return e;
}

export function validateArtwork(state: WizardState, ctx: ValidationContext): StepErrors {
  const e: StepErrors = {};
  state.items.forEach((item, i) => {
    if (itemHasPrinting(item, ctx.catalog) && !item.artwork) e[`items.${i}.artwork`] = "artworkRequired";
    item.referenceLinks.forEach((link, j) => {
      if (link.trim() && !isValidUrl(link)) e[`items.${i}.links.${j}`] = "linkInvalid";
    });
  });
  return e;
}

export function validateContact(state: WizardState): StepErrors {
  const e: StepErrors = {};
  const c = state.contact;
  if (!c.name.trim()) e["contact.name"] = "nameRequired";
  if (!c.email.trim() && !c.whatsapp.trim()) e["contact.whatsapp"] = "contactRequired";
  if (c.email.trim() && !isValidEmail(c.email)) e["contact.email"] = "emailInvalid";
  if (c.whatsapp.trim() && !normalizeWhatsapp(c.whatsapp)) e["contact.whatsapp"] = "whatsappInvalid";
  if (!c.city.trim()) e["contact.city"] = "cityRequired";
  if (!c.address.trim()) e["contact.address"] = "addressRequired";
  if (!c.consent) e["contact.consent"] = "consentRequired";
  return e;
}

/** Errores del paso indicado (los pasos 2–5 validan la pieza en edición). */
export function validateStep(state: WizardState, step: StepId, ctx: ValidationContext): StepErrors {
  const item = state.items[state.current];
  const today = ctx.today ?? todayInPanama();
  switch (step) {
    case 0:
      return state.segment ? {} : { segment: "segmentRequired" };
    case 1:
      return validateProduct(state);
    case 2:
      return item ? validateItemType(item, ctx) : { type: "typeRequired" };
    case 3:
      return item ? validateItemSize(item, ctx) : {};
    case 4:
      return item ? validateItemMaterial(item, state.segment, ctx) : {};
    case 5:
      return item ? validateItemPrint(item, ctx) : {};
    case 6:
      return validateQuantities(state, today);
    case 7:
      return validateArtwork(state, ctx);
    case 8:
      return validateContact(state);
    case 9:
      return {};
  }
}

/**
 * Valida la solicitud completa antes de enviarla. Devuelve el primer paso con
 * errores (y la pieza, si aplica) para llevar a la persona directo ahí.
 */
export function validateAll(state: WizardState, ctx: ValidationContext): { ok: true } | { ok: false; step: StepId; item: number; errors: StepErrors } {
  const today = ctx.today ?? todayInPanama();
  for (const step of [0, 1] as const) {
    const errors = validateStep(state, step, { ...ctx, today });
    if (Object.keys(errors).length) return { ok: false, step, item: 0, errors };
  }
  if (state.items.length === 0) return { ok: false, step: 2, item: 0, errors: { type: "typeRequired" } };
  for (let i = 0; i < state.items.length; i++) {
    for (const step of [2, 3, 4, 5] as const) {
      const errors = validateStep({ ...state, current: i }, step, { ...ctx, today });
      if (Object.keys(errors).length) return { ok: false, step, item: i, errors };
    }
  }
  for (const step of [6, 7, 8] as const) {
    const errors = validateStep(state, step, { ...ctx, today });
    if (Object.keys(errors).length) return { ok: false, step, item: 0, errors };
  }
  return { ok: true };
}
