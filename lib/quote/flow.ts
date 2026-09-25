import { evaluateCaliber, evaluatePaper } from "@/lib/compat";
import type { PublicCatalog } from "@/lib/catalog/public";
import { emptyItem, type ItemDraft, type StepId, type WizardSegment, type WizardState } from "./types";
import { typeFitsSegment } from "./validate";

/**
 * Navegación del wizard (PRD §8). Cada pieza recorre los pasos 2 a 5; el resto
 * es común. "No sé, sugiéranme" en el paso 2 salta al paso 6. Funciones puras:
 * reciben un estado y devuelven el siguiente.
 */
export type FlowState = WizardState & { returnToSummary?: boolean };

export const TOTAL_STEPS = 10;

export function goNext(state: FlowState): FlowState {
  const item = state.items[state.current];
  const pieceStep = state.step >= 2 && state.step <= 5;
  const pieceDone = (state.step === 2 && item?.needsAdvice) || state.step === 5;
  // Llegó desde el resumen: al terminar el paso (o la pieza) vuelve al resumen.
  if (state.returnToSummary && (pieceDone || !pieceStep)) return { ...state, step: 9, returnToSummary: false };
  if (pieceDone) return { ...state, step: 6 };
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

/** "Agregar otra pieza": nueva pieza vacía y vuelta al paso 2 (desde el resumen, vuelve a él al terminarla). */
export function addPiece(state: FlowState, opts: { returnToSummary?: boolean } = {}): FlowState {
  if (state.items.length >= MAX_PIECES) return state;
  const items = [...state.items, emptyItem()];
  return { ...state, items, current: items.length - 1, step: 2, returnToSummary: opts.returnToSummary ?? false };
}

export const MAX_PIECES = 20;

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

/** "Ir al paso" desde el resumen: tras corregirlo, Continuar vuelve al resumen. */
export function goToStep(state: FlowState, step: StepId): FlowState {
  return { ...state, step, returnToSummary: step !== 9 };
}

/** Cambia el segmento y suelta los tipos elegidos que ya no sirven para él. */
export function setSegment(state: FlowState, segment: WizardSegment, catalog: PublicCatalog): FlowState {
  const items = state.items.map((it) => {
    const type = catalog.productTypes.find((t) => t.id === it.productTypeId);
    return type && !typeFitsSegment(type.segments, segment) ? { ...it, productTypeId: null } : it;
  });
  return { ...state, segment, items };
}

/** Pieza sin ninguna elección todavía (se puede reutilizar al precargar). */
export function isBlankItem(it: ItemDraft): boolean {
  return (
    !it.productTypeId &&
    !it.needsAdvice &&
    !it.sizeMode &&
    !it.paperId &&
    !it.caliberId &&
    !it.printOptionId &&
    it.quantities.every((q) => !q.trim()) &&
    it.referenceSampleIds.length === 0 &&
    it.referenceLinks.length === 0
  );
}

/** Entrada desde una ficha ("Cotizar esta pieza", ?tipo=) o una muestra ("Quiero algo así", ?muestra=). */
export type Preload = { typeId: string | null; sampleId: string | null };
export type PreloadOutcome = "none" | "added_piece" | "filled_piece" | "added_reference" | "existing_piece";

/**
 * Suma la precarga al borrador en curso sin perder nada (D-028): el tipo va a
 * la pieza que ya lo tenga, a una pieza vacía o a una pieza nueva; la muestra
 * queda como referencia de esa pieza. Si el tipo no sirve para el segmento ya
 * elegido, el segmento pasa a "No estoy seguro" (admite todos los tipos).
 */
export function applyPreload(state: FlowState, preload: Preload, catalog: PublicCatalog): { state: FlowState; outcome: PreloadOutcome; piece: number } {
  const sample = preload.sampleId ? catalog.gallery.find((g) => g.id === preload.sampleId) : undefined;
  const type = catalog.productTypes.find((t) => t.id === (preload.typeId ?? sample?.productTypeId ?? null));
  if (!type && !sample) return { state, outcome: "none", piece: state.current };

  const items = [...state.items];
  let index = type ? items.findIndex((it) => it.productTypeId === type.id) : -1;
  let outcome: PreloadOutcome = sample ? "added_reference" : "existing_piece";
  if (index < 0) {
    index = items.findIndex(isBlankItem);
    outcome = "filled_piece";
  }
  if (index < 0) {
    if (items.length >= MAX_PIECES) return { state, outcome: "none", piece: state.current };
    items.push(emptyItem());
    index = items.length - 1;
    outcome = "added_piece";
  }
  let item = items[index] as ItemDraft;
  if (type && item.productTypeId !== type.id) item = setItemType(item, type.id, catalog);
  if (sample && !item.referenceSampleIds.includes(sample.id)) item = { ...item, referenceSampleIds: [...item.referenceSampleIds, sample.id].slice(0, 10) };
  items[index] = item;

  let segment = state.segment;
  if (type) {
    if (!segment) segment = type.segments.length === 1 ? (type.segments[0] as WizardSegment) : null;
    else if (!typeFitsSegment(type.segments, segment)) segment = "unsure";
  }
  const next: FlowState = { ...state, items, segment };
  if (outcome === "added_reference" || outcome === "existing_piece") return { state: next, outcome, piece: index };
  // Pieza nueva o completada: se abre en el paso 2 para seguir configurándola
  // (si el borrador aún está en los pasos 0–1, se respeta ese punto).
  return { state: { ...next, current: index, step: state.step <= 1 ? state.step : 2, returnToSummary: false }, outcome, piece: index };
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
