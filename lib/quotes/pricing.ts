/**
 * Precio de venta por línea (PRD §11 "Cotización formal"): costo de fábrica +
 * flete estimado + margen editable por línea. El margen es sobre el precio de
 * venta (margen bruto): precio = costo total unitario / (1 − margen). Uso
 * interno: el cliente solo ve el precio final en el PDF (D-067).
 */
export type PriceInput = { quantity: number; unitCost: number; freightTotal: number; marginPct: number };
export type PriceResult = { unitCostTotal: number; unitPrice: number; subtotal: number; markupPct: number };

const round = (n: number, decimals: number) => Math.round((n + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;

export function priceLine({ quantity, unitCost, freightTotal, marginPct }: PriceInput): PriceResult | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;
  if (!Number.isFinite(freightTotal) || freightTotal < 0) return null;
  if (!Number.isFinite(marginPct) || marginPct < 0 || marginPct >= 95) return null;
  const unitCostTotal = unitCost + freightTotal / quantity;
  // Precio unitario con 4 decimales (empaques de centavos); subtotal a 2 decimales.
  const unitPrice = round(unitCostTotal / (1 - marginPct / 100), 4);
  const subtotal = round(unitPrice * quantity, 2);
  const markupPct = round((unitPrice / unitCostTotal - 1) * 100, 1);
  return { unitCostTotal: round(unitCostTotal, 4), unitPrice, subtotal, markupPct };
}

/**
 * Número escrito en el panel (REG-01). La pantalla muestra "5,000.00", así que
 * se lee igual:
 * - coma de miles en grupos de 3 y punto decimal: "5,000" → 5000, "1,234.50";
 * - una sola coma que no forma grupos de miles es decimal: "0,35", "12,5";
 * - lo ambiguo o mezclado al revés ("1.234,5", "1,2,3") se rechaza.
 * El panel muestra junto al campo el valor interpretado antes de guardar.
 */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/\s/g, "");
  let normalized: string;
  if (/^\d+(\.\d+)?$/.test(t)) normalized = t;
  else if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) normalized = t.replace(/,/g, "");
  else if (/^\d+,\d{1,4}$/.test(t) && !/^[1-9]\d{0,2},\d{3}$/.test(t)) normalized = t.replace(",", ".");
  else return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(amount: number, currency = "USD", decimals = 2): string {
  return new Intl.NumberFormat("es-PA", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
}

/** Precio unitario: hasta 4 decimales, sin ceros de más (mínimo 2). */
export function formatUnitPrice(amount: number, currency = "USD"): string {
  const decimals = Math.max(2, Math.min(4, (String(amount).split(".")[1] ?? "").length));
  return formatMoney(amount, currency, decimals);
}
