/**
 * Copia del borrador del cotizador en este dispositivo (respaldo; la verdad
 * está en quote_drafts). Solo se usa en el navegador.
 */
import { WIZARD_VERSION, type WizardState } from "./types";

export const LOCAL_KEY = "provenpack:cotizador";

export type LocalDraft = { token: string | null; state: WizardState; savedAt: string };

/** La copia local vence como el borrador del servidor. */
const LOCAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Copia de este dispositivo, solo si tiene la forma de la versión actual del
 * cotizador (UX-16, COD-09). Lo vencido o de otra versión se descarta.
 */
export function readLocal(now: number = Date.now()): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<LocalDraft>;
    if (!isLocalDraft(draft) || now - Date.parse(draft.savedAt) > LOCAL_MAX_AGE_MS) {
      clearLocal();
      return null;
    }
    return draft;
  } catch {
    clearLocal();
    return null;
  }
}

export function isLocalDraft(d: Partial<LocalDraft> | null | undefined): d is LocalDraft {
  const s = d?.state as Partial<WizardState> | undefined;
  return (
    typeof d?.savedAt === "string" &&
    Number.isFinite(Date.parse(d.savedAt)) &&
    (d.token === null || typeof d.token === "string") &&
    !!s &&
    s.version === WIZARD_VERSION &&
    typeof s.step === "number" &&
    s.step >= 0 &&
    s.step <= 9 &&
    Array.isArray(s.items) &&
    s.items.length > 0 &&
    s.items.every((it) => typeof it === "object" && it !== null && Array.isArray(it.quantities)) &&
    typeof s.contact === "object" &&
    s.contact !== null &&
    typeof s.product === "object" &&
    s.product !== null
  );
}

export function writeLocal(token: string | null, state: WizardState) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ token, state, savedAt: new Date().toISOString() }));
  } catch {
    // almacenamiento lleno o bloqueado: el servidor sigue siendo la fuente de verdad
  }
}

export function clearLocal() {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignorar
  }
}

