import { describe, expect, it } from "vitest";
import { RFQ_COLUMNS } from "@/config/rfq-format";
import { formatUnitPrice, parseMoney, priceLine } from "@/lib/quotes/pricing";
import { rfqRows } from "@/lib/rfq/rows";
import type { ItemSpec } from "@/lib/quote/spec";

describe("precio por línea (costo + flete + margen)", () => {
  it("margen sobre el precio de venta, precio unitario a 4 decimales y subtotal a 2", () => {
    const r = priceLine({ quantity: 5000, unitCost: 0.2, freightTotal: 250, marginPct: 35 });
    // costo unitario total = 0,20 + 250/5000 = 0,25; precio = 0,25 / 0,65
    expect(r).toEqual({ unitCostTotal: 0.25, unitPrice: 0.3846, subtotal: 1923, markupPct: 53.8 });
    expect(priceLine({ quantity: 1000, unitCost: 1, freightTotal: 0, marginPct: 0 })?.unitPrice).toBe(1);
  });

  it("rechaza datos imposibles", () => {
    expect(priceLine({ quantity: 0, unitCost: 1, freightTotal: 0, marginPct: 30 })).toBeNull();
    expect(priceLine({ quantity: 100, unitCost: 0, freightTotal: 0, marginPct: 30 })).toBeNull();
    expect(priceLine({ quantity: 100, unitCost: 1, freightTotal: -1, marginPct: 30 })).toBeNull();
    expect(priceLine({ quantity: 100, unitCost: 1, freightTotal: 0, marginPct: 95 })).toBeNull();
  });

  it("montos escritos con coma o punto y formato en dólares", () => {
    expect(parseMoney("0,35")).toBe(0.35);
    expect(parseMoney(" 12.5 ")).toBe(12.5);
    expect(parseMoney("1.234,5")).toBeNull();
    expect(formatUnitPrice(0.3846)).toMatch(/0\.3846/);
    expect(formatUnitPrice(2)).toMatch(/2\.00/);
  });
});

describe("filas del RFQ", () => {
  const spec: ItemSpec = {
    position: 1,
    needsAdvice: false,
    category: { id: "c", code: "CAJ", name: "Cajas" },
    type: { id: "t", code: "CJ-06", name: "Mailer de envío" },
    size: { mode: "standard", standard: { id: "s", code: "CJ-S03", name: "S3", l: 30, w: 20, h: 10 }, custom: null },
    materialAdvice: false,
    paper: { id: "p", code: "PA-03", name: "Cartón microcorrugado" },
    caliber: { id: "k", code: "CA-02", name: "Medio" },
    eco: [],
    food: [],
    print: { option: { id: "o", code: "PR-PT", name: "Pantone especial" }, noPrint: false, pantone: ["186 C"], faces: "outside", coverage: "logo" },
    finishes: [{ id: "f", code: "AC-01", name: "Laminado mate" }],
    product: { name: "Kits", contents: "", weightG: 350, dims: null, volume: "", conditions: [], uses: ["shipping"] },
    quantities: [1000, 5000],
    frequency: "once",
    artwork: "has_artwork",
    artworkFileCount: 1,
    references: { links: [], samples: [], photoCount: 0 },
  };

  it("una fila por pieza y cantidad con los códigos de catálogo (sin retipear)", () => {
    const rows = rfqRows({ number: "S-2026-00012", items: [{ position: 1, spec, artwork: "Arte liberado: proof.pdf" }] }, (key) => key);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.quantity)).toEqual([1000, 5000]);
    expect(rows[0]).toMatchObject({
      request: "S-2026-00012",
      piece: 1,
      typeCode: "CJ-06",
      sizeCode: "CJ-S03",
      lengthCm: 30,
      paperCode: "PA-03",
      caliberCode: "CA-02",
      printCode: "PR-PT",
      pantone: "186 C",
      finishes: "AC-01 · Laminado mate",
      weightG: 350,
      artwork: "Arte liberado: proof.pdf",
    });
  });

  it("las columnas de la fábrica van al final y vacías", () => {
    const factory = RFQ_COLUMNS.filter((c) => c.factory).map((c) => c.key);
    expect(factory).toEqual(["unitCost", "currency", "productionDays", "factoryNotes"]);
    expect(RFQ_COLUMNS.slice(-4).every((c) => c.factory)).toBe(true);
  });
});
