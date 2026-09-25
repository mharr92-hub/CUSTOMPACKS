/**
 * Semáforo de completitud (PRD §8 y TAREAS E3):
 * - Rojo: falta cantidad, tipo, o arte cuando la pieza lleva impresión.
 * - Amarillo: faltan datos no críticos (peso, medidas del producto o
 *   referencias), o el cliente pidió diseño del arte.
 * - Verde: lista para fábrica.
 * La solicitud toma el peor color de sus piezas. `missing` alimenta la
 * plantilla "Pedir datos faltantes" del panel (E6).
 */
export type TrafficLight = "green" | "yellow" | "red";

export type MissingField = "type" | "quantity" | "artwork" | "weight" | "dimensions" | "references" | "design";

export type TrafficItemInput = {
  hasType: boolean;
  quantityCount: number;
  hasPrinting: boolean;
  artworkFileCount: number;
  artworkChoice: "has_artwork" | "no_artwork_yet" | "needs_design" | null;
  hasWeight: boolean;
  hasProductDimensions: boolean;
  referenceCount: number;
};

export type TrafficResult = {
  light: TrafficLight;
  missing: { item: number; field: MissingField; severity: "red" | "yellow" }[];
};

const RANK: Record<TrafficLight, number> = { green: 0, yellow: 1, red: 2 };

export function trafficLight(items: readonly TrafficItemInput[]): TrafficResult {
  const missing: TrafficResult["missing"] = [];
  if (items.length === 0) return { light: "red", missing: [{ item: 0, field: "type", severity: "red" }] };
  items.forEach((it, index) => {
    const item = index + 1;
    if (!it.hasType) missing.push({ item, field: "type", severity: "red" });
    if (it.quantityCount === 0) missing.push({ item, field: "quantity", severity: "red" });
    if (it.hasPrinting && it.artworkFileCount === 0) {
      if (it.artworkChoice === "needs_design") missing.push({ item, field: "design", severity: "yellow" });
      else missing.push({ item, field: "artwork", severity: "red" });
    }
    if (!it.hasWeight) missing.push({ item, field: "weight", severity: "yellow" });
    if (!it.hasProductDimensions) missing.push({ item, field: "dimensions", severity: "yellow" });
    if (it.referenceCount === 0) missing.push({ item, field: "references", severity: "yellow" });
  });
  const light = missing.reduce<TrafficLight>((acc, m) => (RANK[m.severity] > RANK[acc] ? m.severity : acc), "green");
  return { light, missing };
}
