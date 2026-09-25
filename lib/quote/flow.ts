import { evaluateCaliber, evaluatePaper } from "@/lib/compat";
import type { PublicCatalog } from "@/lib/catalog/public";
import { emptyItem, type ItemDraft, type StepId, type WizardState } from "./types";

/**
 * Navegación del wizard (PRD §8). Cada pieza recorre los pasos 2 a 5; el resto
 * es común. "No sé, sugiéranme" en el paso 2 salta al paso 6. Funciones puras:
 * reciben un estado y devuelven el siguiente.
 */
export type FlowState = WizardState & { returnToSummary?: boolean };

export const TOTAL_STEPS = 10;

export function goNext(state: FlowState): FlowState {
  const item = state.items[state.current];
  const pieceDone = (state.step === 2 && item?.needsAdvice) || state.step === 5;
  if (pieceDone) {
    if (state.returnToSummary) return { ...state, step: 9, returnToSummary: false };
    return { ...state, step: 6 };
  }
  if (state.step >= 9) return state;
  return { ...state, step: (state.step + 1) as StepId };
}

export function goBack(state: FlowState): FlowState {
  switch (state.step) {
    case 0:
      return state;
    case 2: {
      if (state.current > 0) {
        const prev = state.current - 1;
        return { ...state, current: prev, step: state.items[prev]?.needsAdvice ? 2 : 5 };
      }
      return { ...state, step: 1 };
    }
    case 6: {
      const last = state.items.length - 1;
      return { ...state, current: last, step: state.items[last]?.needsAdvice ? 2 : 5 };
    }
    default:
      return { ...state, step: (state.step - 1) as StepId };
  }
}

/** "Agregar otra pieza": nueva pieza vacía y vuelta al paso 2. */
export function addPiece(state: FlowState): FlowState {
  const items = [...state.items, emptyItem()];
  return { ...state, items, current: items.length - 1, step: 2, returnToSummary: false };
}

export function removePiece(state: FlowState, index: number): FlowState {
  if (state.items.length <= 1) return state;
  const items = state.items.filter((_, i) => i !== index);
  const current = Math.min(state.current, items.length - 1);
  return { ...state, items, current };
}

/** Editar una pieza desde el resumen: recorre 2–5 y vuelve al resumen. */
export function editPiece(state: FlowState, index: number): FlowState {
  return { ...state, current: index, step: 2, returnToSummary: true };
}

export function goToStep(state: FlowState, step: StepId): FlowState {
  return { ...state, step, returnToSummary: step >= 2 && step <= 5 ? true : state.returnToSummary };
}

/** Progreso visible ("Paso 3 de 10"): los pasos se numeran de 1 a 10. */
export function progress(state: WizardState): { index: number; total: number; pct: number } {
  const index = state.step + 1;
  return { index, total: TOTAL_STEPS, pct: Math.round((index / TOTAL_STEPS) * 100) };
}

// ---------------------------------------------------------------------------
// Cambios que invalidan selecciones dependientes (nunca queda una combinación
// imposible guardada en el borrador).
// ---------------------------------------------------------------------------
export function setItemType(item: ItemDraft, productTypeId: string | null, catalog: PublicCatalog): ItemDraft {
  const type = catalog.productTypes.find((t) => t.id === productTypeId);
  const next: ItemDraft = {
    ...item,
    productTypeId: type?.id ?? null,
    categoryId: type?.categoryId ?? item.categoryId,
    needsAdvice: false,
  };
  if (!type) return next;
  const size = catalog.sizes.find((s) => s.id === item.standardSizeId);
  if (size && size.family !== type.sizeFamily) next.standardSizeId = null;
  if (next.paperId && !evaluatePaper(catalog.compatibilities, type.id, next.paperId).allowed) next.paperId = null;
  if (next.caliberId && !evaluateCaliber(catalog.compatibilities, type.id, next.paperId, next.caliberId).allowed) next.caliberId = null;
  return next;
}

export function setItemPaper(item: ItemDraft, paperId: string | null, catalog: PublicCatalog): ItemDraft {
  const next: ItemDraft = { ...item, paperId, materialAdvice: false };
  if (item.productTypeId && next.caliberId && !evaluateCaliber(catalog.compatibilities, item.productTypeId, paperId, next.caliberId).allowed) {
    next.caliberId = null;
  }
  return next;
}

export function setItemPrint(item: ItemDraft, printOptionId: string, catalog: PublicCatalog): ItemDraft {
  const opt = catalog.printOptions.find((p) => p.id === printOptionId);
  const next: ItemDraft = { ...item, printOptionId };
  if (!opt?.requiresPantone) next.pantone = "";
  if (opt?.isNoPrint) {
    next.faces = null;
    next.coverage = null;
    next.artwork = null;
  }
  return next;
}
