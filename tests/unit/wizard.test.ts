import { describe, expect, it } from "vitest";
import type { PublicCatalog } from "@/lib/catalog/public";
import { addPiece, applyPreload, editPiece, goBack, goNext, goToStep, removePiece, setItemPaper, setItemPrint, setItemType, setSegment } from "@/lib/quote/flow";
import { optionEvents } from "@/lib/quote/option-events";
import { itemSpecFromDraft, specRows, trafficInputFromSpec } from "@/lib/quote/spec";
import { emptyItem, initialWizardState, type WizardState } from "@/lib/quote/types";
import {
  normalizeWhatsapp,
  parseCm,
  parsePantoneCodes,
  parseQuantity,
  parseWeightGrams,
  validateAll,
  validateStep,
} from "@/lib/quote/validate";

// --- Catálogo mínimo de prueba ---------------------------------------------
const base = { description: null, photoUrl: null, sortOrder: 0 };
const catalog: PublicCatalog = {
  categories: [{ ...base, id: "cat-food", code: "ALI", slug: "alimentario", name: "Alimentario" }],
  productTypes: [
    { ...base, id: "t-balde", code: "CJ-10", slug: "balde", name: "Balde", categoryId: "cat-food", segments: ["food"], sizeFamily: "food_box", typicalUses: [], photos: [] },
    { ...base, id: "t-caja", code: "CJ-01", slug: "caja", name: "Caja", categoryId: "cat-food", segments: ["commercial", "food"], sizeFamily: "box", typicalUses: [], photos: [] },
  ],
  sizes: [
    { ...base, id: "s-box", code: "CJ-S01", name: "S1", family: "box", lengthCm: 8, widthCm: 5, heightCm: 3 },
    { ...base, id: "s-food", code: "AL-S01", name: "S1", family: "food_box", lengthCm: 9, widthCm: 9, heightCm: 6 },
  ],
  papers: [
    { ...base, id: "p-kraft", code: "PA-01", name: "Kraft", isBarrier: false, suggestedForConditions: [] },
    { ...base, id: "p-grasa", code: "PA-05", name: "Antigrasa", isBarrier: true, suggestedForConditions: ["grease"] },
  ],
  calibers: [{ ...base, id: "c-lig", code: "CA-01", name: "Ligero", simpleLabel: null, grammageGsm: null, points: null, minWeightG: 0, maxWeightG: 500 }],
  printOptions: [
    { ...base, id: "pr-none", code: "PR-00", name: "Sin impresión", inkCount: 0, requiresPantone: false, isNoPrint: true },
    { ...base, id: "pr-pt", code: "PR-PT", name: "Pantone", inkCount: null, requiresPantone: true, isNoPrint: false },
  ],
  finishes: [],
  ecoAttributes: [],
  foodAttributes: [{ ...base, id: "f-grasa", code: "AL-02", name: "Resistente a grasa", suggestedForConditions: ["grease"] }],
  gallery: [
    { ...base, id: "g-1", code: "M-001", name: "Balde rojo", photos: [], segments: ["food"], productTypeId: "t-balde", paperId: null, finishIds: [], tags: [] },
    { ...base, id: "g-2", code: "M-002", name: "Caja kraft", photos: [], segments: ["commercial"], productTypeId: "t-caja", paperId: null, finishIds: [], tags: [] },
  ],
  compatibilities: [{ productTypeId: "t-balde", paperId: "p-grasa", caliberId: null, allowed: true, reason: "El balde exige antigrasa." }],
  settings: {},
};
const ctx = { catalog, today: "2026-09-24" };

function validState(): WizardState {
  const s = initialWizardState(new Date("2026-09-24T12:00:00Z"));
  s.segment = "food";
  s.product.name = "Pollo";
  s.items = [
    {
      ...emptyItem("a"),
      productTypeId: "t-balde",
      categoryId: "cat-food",
      sizeMode: "standard",
      standardSizeId: "s-food",
      paperId: "p-grasa",
      caliberId: "c-lig",
      foodIds: ["f-grasa"],
      printOptionId: "pr-none",
      quantities: ["5000", "", ""],
      frequency: "once",
    },
  ];
  s.contact = { ...s.contact, name: "Ana", whatsapp: "+507 6123-4567", city: "Panamá", address: "Calle 50", consent: true };
  return s;
}

describe("parsers de campos", () => {
  it("medidas en cm: > 0 y con un decimal como máximo", () => {
    expect(parseCm("12,5")).toBe(12.5);
    expect(parseCm("12.5")).toBe(12.5);
    expect(parseCm("12,55")).toBe("invalid");
    expect(parseCm("0")).toBe("invalid");
    expect(parseCm("")).toBeNull();
  });

  it("cantidades enteras con separador de miles", () => {
    expect(parseQuantity("5000")).toBe(5000);
    expect(parseQuantity("5.000")).toBe(5000);
    expect(parseQuantity("10,000")).toBe(10000);
    expect(parseQuantity("500 000")).toBe(500000);
    expect(parseQuantity("5.5")).toBe("invalid");
    expect(parseQuantity("0")).toBe("invalid");
    expect(parseQuantity("-3")).toBe("invalid");
  });

  it("peso en g o kg", () => {
    expect(parseWeightGrams("1,5", "kg")).toBe(1500);
    expect(parseWeightGrams("250", "g")).toBe(250);
    expect(parseWeightGrams("abc", "g")).toBe("invalid");
  });

  it("WhatsApp con código de país", () => {
    expect(normalizeWhatsapp("+507 6123-4567")).toBe("+50761234567");
    expect(normalizeWhatsapp("00507 61234567")).toBe("+50761234567");
    expect(normalizeWhatsapp("6123-4567")).toBeNull();
    expect(normalizeWhatsapp("+507 abc")).toBeNull();
  });

  it("Pantone: número + C o U", () => {
    expect(parsePantoneCodes("186 C, 7621u; Pantone 485C")).toEqual(["186 C", "7621 U", "485 C"]);
    expect(parsePantoneCodes("186")).toBe("invalid");
    expect(parsePantoneCodes("rojo")).toBe("invalid");
    expect(parsePantoneCodes("")).toEqual([]);
  });
});

describe("validación por paso", () => {
  it("una solicitud completa es válida", () => {
    expect(validateAll(validState(), ctx)).toEqual({ ok: true });
  });

  it("rechaza una combinación inválida aunque llegue del navegador", () => {
    const s = validState();
    s.items[0]!.paperId = "p-kraft";
    const result = validateAll(s, ctx);
    expect(result).toMatchObject({ ok: false, step: 4, errors: { paper: "paperNotAllowed" } });
  });

  it("el tipo tiene que servir para el segmento elegido", () => {
    const s = { ...validState(), segment: "commercial" as const, step: 2 as const };
    expect(validateStep(s, 2, ctx)).toEqual({ type: "typeSegment" });
    expect(validateStep({ ...s, segment: "unsure" }, 2, ctx)).toEqual({});
  });

  it("un tipo solo alimentario exige aptitud alimentaria aunque el segmento sea «No estoy seguro»", () => {
    const s = { ...validState(), segment: "unsure" as const };
    s.items = [{ ...s.items[0]!, foodIds: [] }];
    expect(validateStep(s, 4, ctx)).toEqual({ food: "foodRequired" });
  });

  it("en alimentos la aptitud alimentaria es obligatoria", () => {
    const s = validState();
    s.items[0]!.foodIds = [];
    expect(validateStep(s, 4, ctx)).toEqual({ food: "foodRequired" });
  });

  it("Pantone exige códigos válidos", () => {
    const s = validState();
    s.items[0]!.printOptionId = "pr-pt";
    s.items[0]!.faces = "outside";
    s.items[0]!.coverage = "logo";
    expect(validateStep(s, 5, ctx)).toEqual({ pantone: "pantoneRequired" });
    s.items[0]!.pantone = "186";
    expect(validateStep(s, 5, ctx)).toEqual({ pantone: "pantoneInvalid" });
  });

  it("cantidades y fecha", () => {
    const s = validState();
    s.items[0]!.quantities = ["", "", ""];
    s.desiredDate = "2026-09-01";
    expect(validateStep(s, 6, ctx)).toEqual({ "items.0.quantities": "quantityRequired", desiredDate: "dateInPast" });
  });

  it("contacto: WhatsApp o correo, formato, ciudad, dirección y consentimiento", () => {
    const s = validState();
    s.contact = { ...s.contact, whatsapp: "", email: "", address: "", consent: false };
    expect(validateStep(s, 8, ctx)).toEqual({
      "contact.whatsapp": "contactRequired",
      "contact.address": "addressRequired",
      "contact.consent": "consentRequired",
    });
    s.contact.email = "ana@";
    expect(validateStep(s, 8, ctx)["contact.email"]).toBe("emailInvalid");
  });

  it("con impresión hay que elegir qué pasa con el arte", () => {
    const s = validState();
    s.items[0]!.printOptionId = "pr-pt";
    expect(validateStep(s, 7, ctx)).toEqual({ "items.0.artwork": "artworkRequired" });
  });
});

describe("navegación del wizard", () => {
  it("pasos 2–5 por pieza; agregar otra pieza vuelve al paso 2", () => {
    const s = addPiece({ ...validState(), step: 5 });
    expect(s.step).toBe(2);
    expect(s.current).toBe(1);
    expect(s.items).toHaveLength(2);
    expect(goBack(s)).toMatchObject({ step: 5, current: 0 });
  });

  it("«No sé, sugiéranme» salta al paso 6", () => {
    const s = validState();
    s.items[0] = { ...s.items[0]!, needsAdvice: true, productTypeId: null };
    expect(goNext({ ...s, step: 2 }).step).toBe(6);
  });

  it("editar una pieza desde el resumen vuelve al resumen", () => {
    const s = editPiece({ ...validState(), step: 9 }, 0);
    expect(s).toMatchObject({ step: 2, current: 0, returnToSummary: true });
    expect(goNext({ ...s, step: 5 }).step).toBe(9);
  });

  it("no deja quitar la única pieza", () => {
    const s = validState();
    expect(removePiece(s, 0).items).toHaveLength(1);
  });

  it("«No sé, sugiéranme» también permite agregar otra pieza (y desde el resumen vuelve al resumen)", () => {
    const s = validState();
    s.items[0] = { ...s.items[0]!, needsAdvice: true, productTypeId: null };
    const added = addPiece({ ...s, step: 2 });
    expect(added).toMatchObject({ step: 2, current: 1 });
    expect(added.items).toHaveLength(2);
    const fromSummary = addPiece({ ...validState(), step: 9 }, { returnToSummary: true });
    expect(goNext({ ...fromSummary, step: 5 }).step).toBe(9);
  });

  it("«Ir al paso» desde el resumen vuelve al resumen al continuar, en cualquier paso", () => {
    for (const step of [0, 1, 6, 7, 8] as const) {
      const s = goToStep({ ...validState(), step: 9 }, step);
      expect(goNext(s).step).toBe(9);
    }
    const piece = goToStep({ ...validState(), step: 9 }, 3);
    expect(goNext(piece).step).toBe(4);
  });

  it("cambiar el segmento suelta los tipos que ya no sirven", () => {
    const s = setSegment(validState(), "commercial", catalog);
    expect(s.segment).toBe("commercial");
    expect(s.items[0]?.productTypeId).toBeNull();
    expect(setSegment(validState(), "unsure", catalog).items[0]?.productTypeId).toBe("t-balde");
  });

  it("cambiar tipo o papel limpia selecciones que dejan de ser válidas", () => {
    const item = { ...emptyItem("x"), paperId: "p-kraft", standardSizeId: "s-box" };
    const balde = setItemType(item, "t-balde", catalog);
    expect(balde.paperId).toBeNull();
    expect(balde.standardSizeId).toBeNull();
    expect(setItemPaper({ ...balde, caliberId: "c-lig" }, "p-grasa", catalog).caliberId).toBe("c-lig");
    const noPrint = setItemPrint({ ...balde, pantone: "186 C", faces: "both", coverage: "full" }, "pr-none", catalog);
    expect(noPrint).toMatchObject({ pantone: "", faces: null, coverage: null });
  });
});

describe("precarga desde el catálogo o la galería (D-028)", () => {
  it("en una solicitud nueva, el tipo va a la primera pieza y fija el segmento si es único", () => {
    const { state, outcome } = applyPreload(initialWizardState(), { typeId: "t-balde", sampleId: null }, catalog);
    expect(outcome).toBe("filled_piece");
    expect(state.items).toHaveLength(1);
    expect(state).toMatchObject({ segment: "food", step: 0 });
    expect(state.items[0]?.productTypeId).toBe("t-balde");
  });

  it("con un borrador en curso, suma una pieza nueva sin perder nada", () => {
    const draft = { ...validState(), step: 6 as const };
    const { state, outcome, piece } = applyPreload(draft, { typeId: "t-caja", sampleId: null }, catalog);
    expect(outcome).toBe("added_piece");
    expect(piece).toBe(1);
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual(draft.items[0]);
    expect(state).toMatchObject({ step: 2, current: 1, product: draft.product, contact: draft.contact });
  });

  it("la muestra queda como referencia de la pieza del mismo tipo, sin duplicar", () => {
    const draft = { ...validState(), step: 7 as const };
    const once = applyPreload(draft, { typeId: null, sampleId: "g-1" }, catalog);
    expect(once.outcome).toBe("added_reference");
    expect(once.state.items).toHaveLength(1);
    expect(once.state.items[0]?.referenceSampleIds).toEqual(["g-1"]);
    expect(once.state.step).toBe(7);
    const twice = applyPreload(once.state, { typeId: null, sampleId: "g-1" }, catalog);
    expect(twice.state.items[0]?.referenceSampleIds).toEqual(["g-1"]);
  });

  it("si el tipo no sirve para el segmento elegido, el segmento pasa a «No estoy seguro»", () => {
    const draft = { ...validState(), segment: "commercial" as const };
    draft.items = [{ ...draft.items[0]!, productTypeId: "t-caja" }];
    const { state } = applyPreload(draft, { typeId: "t-balde", sampleId: null }, catalog);
    expect(state.segment).toBe("unsure");
    expect(validateAll(state, ctx).ok).toBe(false);
  });
});

describe("analítica de opciones", () => {
  it("emite la opción elegida con códigos de catálogo y sin datos personales", () => {
    const before = validState();
    const after = { ...before, segment: "commercial" as const, contact: { ...before.contact, name: "Otra" } };
    after.items = [{ ...before.items[0]!, paperId: "p-kraft", printOptionId: "pr-pt" }];
    expect(optionEvents(before, after, catalog)).toEqual([
      { step: 0, field: "segment", value: "commercial" },
      { step: 4, field: "paperId", value: "PA-01" },
      { step: 5, field: "printOptionId", value: "PR-PT" },
    ]);
  });
});

describe("ficha técnica congelada", () => {
  it("resuelve códigos y nombres y alimenta el semáforo", () => {
    const s = validState();
    const spec = itemSpecFromDraft(s.items[0]!, 0, s, catalog);
    expect(spec).toMatchObject({
      position: 1,
      type: { code: "CJ-10", name: "Balde" },
      paper: { code: "PA-05" },
      quantities: [5000],
      artwork: "not_applicable",
    });
    expect(trafficInputFromSpec(spec)).toMatchObject({ hasType: true, quantityCount: 1, hasPrinting: false, hasWeight: false });
    const rows = specRows(spec, (key) => key);
    expect(rows.find((r) => r.label === "type")?.value).toBe("CJ-10 · Balde");
    expect(rows.find((r) => r.label === "quantities")?.value).toBe("5,000");
  });
});
