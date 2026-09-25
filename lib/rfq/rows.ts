import type { RfqRow } from "@/config/rfq-format";
import type { ItemSpec, SpecTranslator } from "@/lib/quote/spec";

/**
 * Filas del RFQ: una por pieza y cantidad, con los códigos de catálogo de la
 * ficha congelada (nada se vuelve a escribir a mano). `artwork` describe el
 * arte que acompaña a cada pieza.
 */
const fmtCm = (n: number) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(n);

export function rfqRows(input: { number: string; items: { position: number; spec: ItemSpec; artwork: string }[] }, t: SpecTranslator): RfqRow[] {
  const none = t("none");
  const names = (list: { name: string }[]) => (list.length ? list.map((x) => x.name).join(", ") : "");
  const codes = (list: { code: string }[]) => list.map((x) => x.code).join(", ");
  return input.items.flatMap(({ position, spec, artwork }) => {
    const dims = spec.size.standard ?? spec.size.custom;
    const sizeText =
      spec.size.mode === "standard" && spec.size.standard
        ? t("sizeStandard", { name: spec.size.standard.name, dims: `${fmtCm(spec.size.standard.l)} × ${fmtCm(spec.size.standard.w)} × ${fmtCm(spec.size.standard.h)} cm` })
        : spec.size.mode === "custom" && spec.size.custom
          ? t("sizeCustom", { dims: `${fmtCm(spec.size.custom.l)} × ${fmtCm(spec.size.custom.w)} × ${fmtCm(spec.size.custom.h)} cm` })
          : spec.size.mode === "by_product"
            ? t("sizeByProduct")
            : t("advice");
    const p = spec.product;
    const base = {
      request: input.number,
      piece: position,
      typeCode: spec.type?.code ?? "",
      typeName: spec.type?.name ?? t("typeAdvice"),
      category: spec.category?.name ?? "",
      sizeCode: spec.size.standard?.code ?? "",
      size: sizeText,
      lengthCm: dims?.l ?? null,
      widthCm: dims?.w ?? null,
      heightCm: dims?.h ?? null,
      paperCode: spec.paper?.code ?? "",
      paper: spec.paper?.name ?? (spec.materialAdvice || spec.needsAdvice ? t("materialAdvice") : ""),
      caliberCode: spec.caliber?.code ?? "",
      caliber: spec.caliber?.name ?? "",
      printCode: spec.print.option?.code ?? "",
      print: spec.print.option?.name ?? (spec.needsAdvice ? t("advice") : ""),
      pantone: spec.print.pantone.join(", "),
      faces: spec.print.faces ? t(`facesOptions.${spec.print.faces}`) : "",
      coverage: spec.print.coverage ? t(`coverageOptions.${spec.print.coverage}`) : "",
      finishes: [codes(spec.finishes), names(spec.finishes)].filter(Boolean).join(" · "),
      food: [codes(spec.food), names(spec.food)].filter(Boolean).join(" · "),
      eco: [codes(spec.eco), names(spec.eco)].filter(Boolean).join(" · "),
      product: [p.name, p.contents].filter(Boolean).join(" — "),
      weightG: p.weightG !== null ? Math.round(p.weightG) : null,
      productDims: p.dims ? `${fmtCm(p.dims.l)} × ${fmtCm(p.dims.w)} × ${fmtCm(p.dims.h)} cm` : p.volume,
      conditions: p.conditions.map((c) => t(`conditionOptions.${c}`)).join(", "),
      uses: p.uses.map((u) => t(`useOptions.${u}`)).join(", "),
      frequency: spec.frequency ? t(`frequencyOptions.${spec.frequency}`) : "",
      artwork,
    };
    const quantities = spec.quantities.length ? spec.quantities : [0];
    return quantities.map((quantity) => ({ ...base, quantity, typeName: base.typeName || none }));
  });
}
