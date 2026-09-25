import type { ItemSpec, SpecTranslator } from "@/lib/quote/spec";

/**
 * Checklist de QA en planta contra la especificación aprobada (PRD §11):
 * por cada pieza se verifica material, calibre, medidas, colores/impresión,
 * acabado y cantidad, con el valor esperado sacado de la ficha congelada.
 */
export type QaResult = "ok" | "observed" | "na";
export type QaPoint = { key: string; label: string; expected: string; result: QaResult | null; comment: string };

const QA_KEYS = ["material", "caliber", "size", "print", "finish", "quantity"] as const;
export type QaKey = (typeof QA_KEYS)[number];

const fmtCm = (n: number) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);

/**
 * @param labels títulos de cada punto (messages > admin.order.qa)
 * @param t traductor del namespace `spec` (para "—" y "El equipo lo propone")
 */
export function qaChecklistFromSpec(
  items: readonly { position: number; spec: ItemSpec; quantity: number }[],
  labels: Record<QaKey, string>,
  t: SpecTranslator,
): QaPoint[] {
  return items.flatMap(({ position, spec, quantity }) => {
    const dims = spec.size.standard ?? spec.size.custom;
    const expected: Record<QaKey, string> = {
      material: spec.paper ? `${spec.paper.code} · ${spec.paper.name}` : t("advice"),
      caliber: spec.caliber ? `${spec.caliber.code} · ${spec.caliber.name}` : t("advice"),
      size: dims ? `${fmtCm(dims.l)} × ${fmtCm(dims.w)} × ${fmtCm(dims.h)} cm` : t("advice"),
      print: spec.print.option ? [spec.print.option.name, spec.print.pantone.join(", ")].filter(Boolean).join(" · ") : t("none"),
      finish: spec.finishes.length ? spec.finishes.map((f) => f.name).join(", ") : t("none"),
      quantity: fmtInt(quantity),
    };
    return QA_KEYS.map((key) => ({ key: `${position}:${key}`, label: `${position}. ${labels[key]}`, expected: expected[key], result: null, comment: "" }));
  });
}

/** El checklist está completo cuando cada punto tiene resultado. */
export function qaComplete(points: readonly QaPoint[]): boolean {
  return points.length > 0 && points.every((p) => p.result === "ok" || p.result === "observed" || p.result === "na");
}

/** Sanea lo que llega del formulario contra el checklist esperado. */
export function mergeQaResults(expected: readonly QaPoint[], input: unknown): QaPoint[] {
  const list = Array.isArray(input) ? (input as { key?: unknown; result?: unknown; comment?: unknown }[]) : [];
  return expected.map((p) => {
    const found = list.find((x) => x.key === p.key);
    const result = found?.result === "ok" || found?.result === "observed" || found?.result === "na" ? (found.result as QaResult) : null;
    const comment = typeof found?.comment === "string" ? found.comment.trim().slice(0, 500) : "";
    return { ...p, result, comment };
  });
}
