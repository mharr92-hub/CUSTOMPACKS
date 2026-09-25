import { describe, expect, it } from "vitest";
import { checkDesiredDate, leadTimeDaysFor, leadTimeDaysForQuantities, leadTimeStart } from "@/lib/leadtime";
import { canTransition, nextStatuses, REQUEST_STATUSES, REQUEST_TRANSITIONS } from "@/lib/states";
import { trafficLight, type TrafficItemInput } from "@/lib/traffic-light";

const settings = { thresholdUnits: 10000, smallDays: 30, standardDays: 45 };

describe("plazo de entrega (lib/leadtime.ts)", () => {
  it("≤ umbral → 30 días; por encima → 45", () => {
    expect(leadTimeDaysFor(500, settings)).toBe(30);
    expect(leadTimeDaysFor(10000, settings)).toBe(30);
    expect(leadTimeDaysFor(10001, settings)).toBe(45);
  });

  it("manda la cantidad más grande de la solicitud e ignora vacíos", () => {
    expect(leadTimeDaysForQuantities([5000, null, 20000], settings)).toBe(45);
    expect(leadTimeDaysForQuantities([3000, undefined], settings)).toBe(30);
    expect(leadTimeDaysForQuantities([null, 0, -5], settings)).toBeNull();
  });

  it("el plazo corre desde el último de anticipo y proof aprobado", () => {
    const deposit = new Date("2026-10-01T10:00:00Z");
    const proof = new Date("2026-10-05T10:00:00Z");
    expect(leadTimeStart(deposit, proof)).toEqual(proof);
    expect(leadTimeStart(proof, deposit)).toEqual(proof);
    expect(leadTimeStart(deposit, null)).toBeNull();
  });

  it("advierte si la fecha deseada es anterior a la entrega más temprana", () => {
    expect(checkDesiredDate("2026-10-10", 30, "2026-09-24")).toEqual({ earliest: "2026-10-24", tooSoon: true });
    expect(checkDesiredDate("2026-12-01", 30, "2026-09-24")).toEqual({ earliest: "2026-10-24", tooSoon: false });
    expect(checkDesiredDate("", 45, "2026-09-24")).toEqual({ earliest: "2026-11-08", tooSoon: false });
    expect(checkDesiredDate("2026-10-10", null, "2026-09-24")).toEqual({ earliest: null, tooSoon: false });
  });
});

describe("máquina de estados (lib/states.ts, PRD §14)", () => {
  it("sigue el diagrama: enviada → en revisión → datos pendientes ↔ en revisión → RFQ → cotizada", () => {
    expect(canTransition("submitted", "in_review")).toBe(true);
    expect(canTransition("in_review", "data_pending")).toBe(true);
    expect(canTransition("data_pending", "in_review")).toBe(true);
    expect(canTransition("in_review", "rfq_sent")).toBe(true);
    expect(canTransition("rfq_sent", "quoted")).toBe(true);
    expect(nextStatuses("quoted")).toEqual(["accepted", "rejected", "expired"]);
    expect(canTransition("expired", "quoted")).toBe(true);
  });

  it("no permite saltos", () => {
    expect(canTransition("submitted", "quoted")).toBe(false);
    expect(canTransition("accepted", "rejected")).toBe(false);
    expect(canTransition("rejected", "quoted")).toBe(false);
  });

  it("toda transición apunta a un estado conocido", () => {
    for (const [from, tos] of Object.entries(REQUEST_TRANSITIONS)) {
      expect(REQUEST_STATUSES).toContain(from);
      for (const to of tos) expect(REQUEST_STATUSES).toContain(to);
    }
  });
});

describe("semáforo de completitud (lib/traffic-light.ts)", () => {
  const complete: TrafficItemInput = {
    hasType: true,
    quantityCount: 1,
    hasPrinting: true,
    artworkFileCount: 1,
    artworkChoice: "has_artwork",
    hasWeight: true,
    hasProductDimensions: true,
    referenceCount: 1,
  };

  it("verde con todo", () => {
    expect(trafficLight([complete])).toEqual({ light: "green", missing: [] });
  });

  it("rojo si falta cantidad, tipo o arte con impresión", () => {
    expect(trafficLight([{ ...complete, quantityCount: 0 }]).light).toBe("red");
    expect(trafficLight([{ ...complete, hasType: false }]).light).toBe("red");
    const noArt = trafficLight([{ ...complete, artworkFileCount: 0, artworkChoice: "no_artwork_yet" }]);
    expect(noArt.light).toBe("red");
    expect(noArt.missing).toContainEqual({ item: 1, field: "artwork", severity: "red" });
  });

  it("sin impresión no hace falta arte", () => {
    expect(trafficLight([{ ...complete, hasPrinting: false, artworkFileCount: 0, artworkChoice: null }]).light).toBe("green");
  });

  it("amarillo si faltan peso, medidas o referencias, o si pidió diseño", () => {
    expect(trafficLight([{ ...complete, hasWeight: false }]).light).toBe("yellow");
    expect(trafficLight([{ ...complete, hasProductDimensions: false }]).light).toBe("yellow");
    expect(trafficLight([{ ...complete, referenceCount: 0 }]).light).toBe("yellow");
    expect(trafficLight([{ ...complete, artworkFileCount: 0, artworkChoice: "needs_design" }]).light).toBe("yellow");
  });

  it("la solicitud toma el peor color de sus piezas y lista lo que falta por pieza", () => {
    const result = trafficLight([complete, { ...complete, hasWeight: false }, { ...complete, quantityCount: 0 }]);
    expect(result.light).toBe("red");
    expect(result.missing).toEqual([
      { item: 2, field: "weight", severity: "yellow" },
      { item: 3, field: "quantity", severity: "red" },
    ]);
  });
});
