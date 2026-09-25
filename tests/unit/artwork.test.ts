import { describe, expect, it } from "vitest";
import { draftFilePath, isDraftPathFor, isRequestPathFor, requestFilePath } from "@/lib/artwork/paths";
import { canStaffMoveArtwork, checklistComplete, checklistObservations, CHECKLIST_KEYS, type Checklist } from "@/lib/artwork/states";

const allOk = Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, { result: "ok" }])) as Checklist;

describe("flujo de revisión del arte (PRD §9)", () => {
  it("el equipo avanza paso a paso y no puede aprobar el proof por el cliente", () => {
    expect(canStaffMoveArtwork("received", "in_review")).toBe(true);
    expect(canStaffMoveArtwork("in_review", "observed")).toBe(true);
    expect(canStaffMoveArtwork("in_review", "approved_for_proof")).toBe(true);
    expect(canStaffMoveArtwork("received", "approved_for_proof")).toBe(false);
    expect(canStaffMoveArtwork("proof_sent", "proof_approved")).toBe(false);
    expect(canStaffMoveArtwork("proof_approved", "released")).toBe(true);
    expect(canStaffMoveArtwork("released", "in_review")).toBe(false);
  });

  it("aprobar para proof exige el checklist completo y sin observaciones", () => {
    expect(checklistComplete(allOk)).toBe(true);
    expect(checklistComplete({ ...allOk, layer: { result: "na" } })).toBe(true);
    expect(checklistComplete({ ...allOk, bleed: { result: "observed", note: "Falta sangrado de 3 mm" } })).toBe(false);
    const { fonts: _omit, ...missing } = allOk;
    expect(checklistComplete(missing)).toBe(false);
    expect(checklistObservations({ ...allOk, color: { result: "observed" }, bleed: { result: "observed" } })).toEqual(["color", "bleed"]);
  });
});

describe("rutas del almacenamiento privado", () => {
  const token = "a".repeat(43);
  const req = "11111111-1111-1111-1111-111111111111";
  const item = "22222222-2222-2222-2222-222222222222";

  it("el prefijo identifica al dueño y el nombre queda saneado", () => {
    const p = draftFilePath(token, "pieza1", "artwork", "n0nce", "Mi Logo (final) ñ.pdf");
    expect(p).toBe(`drafts/${token}/pieza1/artwork/n0nce-Mi-Logo-final-n.pdf`);
    expect(isDraftPathFor(p, token, "pieza1", "artwork")).toBe(true);
    expect(isDraftPathFor(p, token, "pieza2", "artwork")).toBe(false);
    expect(isDraftPathFor(p, token, "pieza1", "reference")).toBe(false);
    const r = requestFilePath(req, item, "proof", "abc", "proof.pdf");
    expect(isRequestPathFor(r, req, item, "proof")).toBe(true);
    expect(isRequestPathFor(`${r}/../../otro`, req, item, "proof")).toBe(false);
  });

  it("rechaza claves que podrían salir del prefijo", () => {
    expect(() => draftFilePath("../x", "pieza1", "artwork", "n", "a.pdf")).toThrow();
    expect(() => requestFilePath("no-es-uuid", item, "artwork", "n", "a.pdf")).toThrow();
  });
});
