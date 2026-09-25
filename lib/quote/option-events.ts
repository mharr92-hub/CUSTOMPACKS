import type { PublicCatalog } from "@/lib/catalog/public";
import type { ItemDraft, StepId, WizardState } from "./types";

/**
 * Evento de analítica "opción elegida" (PRD §8, analítica del embudo): qué
 * eligió la persona en cada campo, con códigos de catálogo y nunca datos
 * personales. Se calcula comparando el estado antes y después de un cambio.
 */
export type OptionEvent = { step: StepId; field: string; value: string };

type Coded = { id: string; code: string };
const code = (list: readonly Coded[], id: string | null) => (id ? (list.find((x) => x.id === id)?.code ?? "unknown") : "none");

const ITEM_FIELDS: { field: keyof ItemDraft; step: StepId; value: (it: ItemDraft, c: PublicCatalog) => string }[] = [
  { field: "productTypeId", step: 2, value: (it, c) => code(c.productTypes, it.productTypeId) },
  { field: "needsAdvice", step: 2, value: (it) => String(it.needsAdvice) },
  { field: "sizeMode", step: 3, value: (it) => it.sizeMode ?? "none" },
  { field: "standardSizeId", step: 3, value: (it, c) => code(c.sizes, it.standardSizeId) },
  { field: "materialAdvice", step: 4, value: (it) => String(it.materialAdvice) },
  { field: "paperId", step: 4, value: (it, c) => code(c.papers, it.paperId) },
  { field: "caliberId", step: 4, value: (it, c) => code(c.calibers, it.caliberId) },
  { field: "printOptionId", step: 5, value: (it, c) => code(c.printOptions, it.printOptionId) },
  { field: "faces", step: 5, value: (it) => it.faces ?? "none" },
  { field: "coverage", step: 5, value: (it) => it.coverage ?? "none" },
  { field: "frequency", step: 6, value: (it) => it.frequency ?? "none" },
  { field: "artwork", step: 7, value: (it) => it.artwork ?? "none" },
];

export function optionEvents(prev: WizardState, next: WizardState, catalog: PublicCatalog): OptionEvent[] {
  const events: OptionEvent[] = [];
  if (prev.segment !== next.segment && next.segment) events.push({ step: 0, field: "segment", value: next.segment });
  for (const item of next.items) {
    const before = prev.items.find((it) => it.key === item.key);
    if (!before) continue;
    for (const f of ITEM_FIELDS) {
      if (before[f.field] === item[f.field]) continue;
      const value = f.value(item, catalog);
      if (value !== "none" && value !== "false") events.push({ step: f.step, field: f.field, value });
    }
  }
  return events;
}

/** Cantidad más alta pedida (para el evento de paso 6 completado; sin datos personales). */
export function maxQuantityBucket(max: number | null): string {
  if (max === null) return "none";
  if (max < 1000) return "<1000";
  if (max < 5000) return "1000-4999";
  if (max <= 10000) return "5000-10000";
  if (max <= 50000) return "10001-50000";
  return ">50000";
}
