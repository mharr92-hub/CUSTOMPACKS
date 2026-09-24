/**
 * Reglas de compatibilidad tipo × papel × calibre (PRD §7, tabla
 * `compatibilities`). Lógica pura, sin textos de UI: cuando una regla no trae
 * motivo, la interfaz arma el mensaje con messages/es.json.
 *
 * Semántica (evaluada por tipo de producto, solo reglas activas):
 * 1. Papel. Una regla (tipo, papel, sin calibre, allowed=false) excluye ese
 *    papel. Si existe al menos una regla (tipo, papel, sin calibre,
 *    allowed=true), esos papeles forman una lista blanca: cualquier otro
 *    papel queda excluido ("el balde exige antigrasa").
 * 2. Calibre. La regla exacta (tipo, papel, calibre) manda sobre la general
 *    (tipo, cualquier papel, calibre). allowed=false excluye; si hay reglas
 *    allowed=true con calibre que apliquen a ese papel, forman lista blanca.
 * 3. Sin reglas aplicables, la combinación es válida.
 */

export type CompatRule = {
  productTypeId: string;
  paperId: string | null;
  caliberId: string | null;
  allowed: boolean;
  reason: string | null;
  isActive?: boolean;
};

export type CompatDecision =
  | { allowed: true }
  | { allowed: false; kind: "blocked"; reason: string | null }
  | { allowed: false; kind: "requires"; reason: string | null; requiredIds: string[] };

const OK: CompatDecision = { allowed: true };

function rulesFor(rules: readonly CompatRule[], productTypeId: string): CompatRule[] {
  return rules.filter((r) => r.productTypeId === productTypeId && r.isActive !== false);
}

/** Decide si un papel es válido para el tipo (sin mirar calibre). */
export function evaluatePaper(rules: readonly CompatRule[], productTypeId: string, paperId: string): CompatDecision {
  const paperRules = rulesFor(rules, productTypeId).filter((r) => r.paperId !== null && r.caliberId === null);
  const block = paperRules.find((r) => r.paperId === paperId && !r.allowed);
  if (block) return { allowed: false, kind: "blocked", reason: block.reason };
  const whitelist = paperRules.filter((r) => r.allowed);
  if (whitelist.length > 0 && !whitelist.some((r) => r.paperId === paperId)) {
    return {
      allowed: false,
      kind: "requires",
      reason: whitelist.find((r) => r.reason)?.reason ?? null,
      requiredIds: whitelist.map((r) => r.paperId as string),
    };
  }
  return OK;
}

/** Decide si un calibre es válido para el tipo con el papel elegido (o sin papel aún). */
export function evaluateCaliber(
  rules: readonly CompatRule[],
  productTypeId: string,
  paperId: string | null,
  caliberId: string,
): CompatDecision {
  const caliberRules = rulesFor(rules, productTypeId).filter(
    (r) => r.caliberId !== null && (r.paperId === null || (paperId !== null && r.paperId === paperId)),
  );
  const exact = paperId ? caliberRules.find((r) => r.paperId === paperId && r.caliberId === caliberId) : undefined;
  if (exact) return exact.allowed ? OK : { allowed: false, kind: "blocked", reason: exact.reason };
  const general = caliberRules.find((r) => r.paperId === null && r.caliberId === caliberId);
  if (general && !general.allowed) return { allowed: false, kind: "blocked", reason: general.reason };
  const whitelist = caliberRules.filter((r) => r.allowed);
  if (whitelist.length > 0 && !whitelist.some((r) => r.caliberId === caliberId)) {
    return {
      allowed: false,
      kind: "requires",
      reason: whitelist.find((r) => r.reason)?.reason ?? null,
      requiredIds: [...new Set(whitelist.map((r) => r.caliberId as string))],
    };
  }
  return OK;
}

/** Evalúa la combinación completa tipo–papel–calibre. */
export function evaluateCombination(
  rules: readonly CompatRule[],
  combo: { productTypeId: string; paperId: string | null; caliberId: string | null },
): CompatDecision {
  if (combo.paperId) {
    const paper = evaluatePaper(rules, combo.productTypeId, combo.paperId);
    if (!paper.allowed) return paper;
  }
  if (combo.caliberId) return evaluateCaliber(rules, combo.productTypeId, combo.paperId, combo.caliberId);
  return OK;
}

/** Anota cada opción con su decisión (para pintar opciones deshabilitadas con motivo). */
export function annotatePapers<T extends { id: string }>(
  rules: readonly CompatRule[],
  productTypeId: string,
  papers: readonly T[],
): Array<T & { decision: CompatDecision }> {
  return papers.map((p) => ({ ...p, decision: evaluatePaper(rules, productTypeId, p.id) }));
}

export function annotateCalibers<T extends { id: string }>(
  rules: readonly CompatRule[],
  productTypeId: string,
  paperId: string | null,
  calibers: readonly T[],
): Array<T & { decision: CompatDecision }> {
  return calibers.map((c) => ({ ...c, decision: evaluateCaliber(rules, productTypeId, paperId, c.id) }));
}

/**
 * Calibre sugerido según el peso aproximado por unidad (paso 4 del wizard).
 * Usa los rangos [min_weight_g, max_weight_g) de cada calibre.
 */
export function suggestCaliberByWeight<T extends { id: string; minWeightG: number | null; maxWeightG: number | null }>(
  calibers: readonly T[],
  weightG: number | null | undefined,
): T | null {
  if (weightG === null || weightG === undefined || !Number.isFinite(weightG) || weightG < 0) return null;
  return (
    calibers.find(
      (c) => (c.minWeightG === null || weightG >= c.minWeightG) && (c.maxWeightG === null || weightG < c.maxWeightG),
    ) ?? null
  );
}
