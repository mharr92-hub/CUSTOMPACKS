/**
 * Flujo de revisión del arte (PRD §9): Recibido → En revisión → Observado
 * (se pide nueva versión) | Aprobado para proof → Proof enviado → Proof
 * aprobado por el cliente → Liberado a fábrica.
 */
export const ARTWORK_STATUSES = [
  "received",
  "in_review",
  "observed",
  "approved_for_proof",
  "proof_sent",
  "proof_approved",
  "released",
] as const;

export type ArtworkStatus = (typeof ARTWORK_STATUSES)[number];

/** Cambios que el equipo puede hacer a mano sobre una versión de arte. */
export const STAFF_ARTWORK_TRANSITIONS: Readonly<Record<ArtworkStatus, readonly ArtworkStatus[]>> = {
  received: ["in_review"],
  in_review: ["observed", "approved_for_proof"],
  observed: ["in_review"],
  approved_for_proof: ["in_review"],
  // proof_sent se alcanza al subir el proof; proof_approved solo lo marca el cliente.
  proof_sent: [],
  proof_approved: ["released"],
  released: [],
};

export function canStaffMoveArtwork(from: ArtworkStatus, to: ArtworkStatus): boolean {
  return STAFF_ARTWORK_TRANSITIONS[from].includes(to);
}

/** Puntos del checklist de preprensa (PRD §21-B), en el orden en que se revisan. */
export const CHECKLIST_KEYS = ["format", "dieline", "color", "resolution", "bleed", "fonts", "layer", "naming"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type ChecklistResult = "ok" | "observed" | "na";
export type Checklist = Partial<Record<ChecklistKey, { result: ChecklistResult; note?: string }>>;

/** El arte puede pasar a proof solo si ningún punto quedó observado ni sin revisar. */
export function checklistComplete(checklist: Checklist): boolean {
  return CHECKLIST_KEYS.every((k) => {
    const r = checklist[k]?.result;
    return r === "ok" || r === "na";
  });
}

export function checklistObservations(checklist: Checklist): ChecklistKey[] {
  return CHECKLIST_KEYS.filter((k) => checklist[k]?.result === "observed");
}
