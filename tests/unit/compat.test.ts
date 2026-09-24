import { describe, expect, it } from "vitest";
import {
  annotatePapers,
  evaluateCaliber,
  evaluateCombination,
  evaluatePaper,
  suggestCaliberByWeight,
  type CompatRule,
} from "@/lib/compat";

const BALDE = "balde";
const RIGIDA = "rigida";
const MAILER = "mailer";
const PLEGADIZA = "plegadiza";
const KRAFT = "kraft";
const ANTIGRASA = "antigrasa";
const MICRO = "micro";
const LIGERO = "ligero";
const MEDIO = "medio";
const PESADO = "pesado";

const rules: CompatRule[] = [
  { productTypeId: BALDE, paperId: ANTIGRASA, caliberId: null, allowed: true, reason: "El balde para pollo exige papel antigrasa." },
  { productTypeId: RIGIDA, paperId: MICRO, caliberId: null, allowed: false, reason: "La caja rígida no se fabrica en microcorrugado." },
  { productTypeId: MAILER, paperId: null, caliberId: LIGERO, allowed: false, reason: "El mailer de envío necesita calibre medio o pesado." },
  { productTypeId: PLEGADIZA, paperId: KRAFT, caliberId: PESADO, allowed: true, reason: null },
];

describe("compatibilidades", () => {
  it("sin reglas, cualquier combinación es válida", () => {
    expect(evaluateCombination(rules, { productTypeId: "otro", paperId: KRAFT, caliberId: PESADO })).toEqual({ allowed: true });
  });

  it("lista blanca de papel: el balde exige antigrasa", () => {
    expect(evaluatePaper(rules, BALDE, ANTIGRASA)).toEqual({ allowed: true });
    expect(evaluatePaper(rules, BALDE, KRAFT)).toEqual({
      allowed: false,
      kind: "requires",
      reason: "El balde para pollo exige papel antigrasa.",
      requiredIds: [ANTIGRASA],
    });
  });

  it("exclusión de papel con motivo: rígida no admite microcorrugado", () => {
    expect(evaluatePaper(rules, RIGIDA, MICRO)).toEqual({
      allowed: false,
      kind: "blocked",
      reason: "La caja rígida no se fabrica en microcorrugado.",
    });
    expect(evaluatePaper(rules, RIGIDA, KRAFT)).toEqual({ allowed: true });
  });

  it("exclusión de calibre para cualquier papel", () => {
    expect(evaluateCaliber(rules, MAILER, KRAFT, LIGERO)).toMatchObject({ allowed: false, kind: "blocked" });
    expect(evaluateCaliber(rules, MAILER, null, LIGERO)).toMatchObject({ allowed: false, kind: "blocked" });
    expect(evaluateCaliber(rules, MAILER, KRAFT, MEDIO)).toEqual({ allowed: true });
  });

  it("lista blanca de calibre por papel, sin afectar otros papeles", () => {
    expect(evaluateCaliber(rules, PLEGADIZA, KRAFT, PESADO)).toEqual({ allowed: true });
    expect(evaluateCaliber(rules, PLEGADIZA, KRAFT, MEDIO)).toEqual({
      allowed: false,
      kind: "requires",
      reason: null,
      requiredIds: [PESADO],
    });
    expect(evaluateCaliber(rules, PLEGADIZA, ANTIGRASA, MEDIO)).toEqual({ allowed: true });
  });

  it("la regla exacta tipo+papel+calibre manda sobre la general", () => {
    const withOverride: CompatRule[] = [
      ...rules,
      { productTypeId: MAILER, paperId: MICRO, caliberId: LIGERO, allowed: true, reason: null },
    ];
    expect(evaluateCaliber(withOverride, MAILER, MICRO, LIGERO)).toEqual({ allowed: true });
    expect(evaluateCaliber(withOverride, MAILER, KRAFT, LIGERO)).toMatchObject({ allowed: false });
  });

  it("la combinación falla primero por papel", () => {
    expect(evaluateCombination(rules, { productTypeId: BALDE, paperId: KRAFT, caliberId: MEDIO })).toMatchObject({
      allowed: false,
      kind: "requires",
    });
  });

  it("ignora reglas inactivas", () => {
    const inactive: CompatRule[] = [{ ...rules[0]!, isActive: false }];
    expect(evaluatePaper(inactive, BALDE, KRAFT)).toEqual({ allowed: true });
  });

  it("anota las opciones de papel con su decisión", () => {
    const annotated = annotatePapers(rules, BALDE, [{ id: KRAFT }, { id: ANTIGRASA }]);
    expect(annotated.map((p) => p.decision.allowed)).toEqual([false, true]);
  });
});

describe("calibre sugerido por peso", () => {
  const calibers = [
    { id: LIGERO, minWeightG: 0, maxWeightG: 500 },
    { id: MEDIO, minWeightG: 500, maxWeightG: 2000 },
    { id: PESADO, minWeightG: 2000, maxWeightG: null },
  ];

  it("elige el rango que contiene el peso", () => {
    expect(suggestCaliberByWeight(calibers, 120)?.id).toBe(LIGERO);
    expect(suggestCaliberByWeight(calibers, 500)?.id).toBe(MEDIO);
    expect(suggestCaliberByWeight(calibers, 2500)?.id).toBe(PESADO);
  });

  it("sin peso no sugiere nada", () => {
    expect(suggestCaliberByWeight(calibers, null)).toBeNull();
    expect(suggestCaliberByWeight(calibers, Number.NaN)).toBeNull();
  });
});
