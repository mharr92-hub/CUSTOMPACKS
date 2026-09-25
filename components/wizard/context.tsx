"use client";

import { createContext, useContext } from "react";
import type { PublicCatalog } from "@/lib/catalog/public";
import type { LeadTimeSettings } from "@/lib/leadtime";
import type { FlowState } from "@/lib/quote/flow";
import type { ItemDraft } from "@/lib/quote/types";
import type { StepErrors } from "@/lib/quote/validate";

export type WizardSettings = { leadTime: LeadTimeSettings; depositPct: number; upload: { maxMb: number; maxFiles: number } };

export type WizardContextValue = {
  state: FlowState;
  catalog: PublicCatalog;
  settings: WizardSettings;
  /** Errores visibles del paso actual (solo tras intentar continuar). */
  errors: StepErrors;
  today: string;
  update: (fn: (s: FlowState) => FlowState) => void;
  updateItem: (fn: (item: ItemDraft) => ItemDraft, index?: number) => void;
  /** Token del borrador en el servidor (null hasta el primer guardado). */
  draftToken: string | null;
  /** Guarda lo pendiente y devuelve el token (null si no se pudo). */
  ensureSaved: () => Promise<string | null>;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard fuera del cotizador");
  return ctx;
}

export function useCurrentItem(): ItemDraft {
  const { state } = useWizard();
  return state.items[state.current] ?? (state.items[0] as ItemDraft);
}
