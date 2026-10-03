import { describe, expect, it } from "vitest";
import { isLocalDraft } from "@/lib/quote/local-draft";
import { initialWizardState } from "@/lib/quote/types";

describe("copia local del cotizador (M8)", () => {
  const savedAt = new Date().toISOString();
  it("acepta la forma de la versión actual", () => {
    expect(isLocalDraft({ token: null, state: initialWizardState(), savedAt })).toBe(true);
    expect(isLocalDraft({ token: "t".repeat(43), state: { ...initialWizardState(), step: 4 }, savedAt })).toBe(true);
  });
  it("descarta otra versión, pasos imposibles o datos rotos", () => {
    expect(isLocalDraft({ token: null, state: { ...initialWizardState(), version: 0 as never }, savedAt })).toBe(false);
    expect(isLocalDraft({ token: null, state: { ...initialWizardState(), step: 12 as never }, savedAt })).toBe(false);
    expect(isLocalDraft({ token: null, state: { ...initialWizardState(), items: [] }, savedAt })).toBe(false);
    expect(isLocalDraft({ token: null, state: { ...initialWizardState(), contact: null as never }, savedAt })).toBe(false);
    expect(isLocalDraft({ token: 5 as never, state: initialWizardState(), savedAt })).toBe(false);
    expect(isLocalDraft({ token: null, state: initialWizardState(), savedAt: "ayer" })).toBe(false);
    expect(isLocalDraft(null)).toBe(false);
  });
});
