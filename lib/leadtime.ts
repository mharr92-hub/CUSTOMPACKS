/**
 * Plazo de entrega (PRD §14 y decisiones provisionales de TAREAS.md):
 * - Hasta `thresholdUnits` unidades → `smallDays` (30); por encima → `standardDays` (45).
 * - El plazo corre desde el último de: anticipo confirmado y proof aprobado.
 * - Incluye producción y tránsito hasta la dirección de entrega.
 * Único lugar donde vive esta regla.
 */
export type LeadTimeSettings = {
  thresholdUnits: number;
  smallDays: number;
  standardDays: number;
};

export const DEFAULT_LEAD_TIME: LeadTimeSettings = { thresholdUnits: 10000, smallDays: 30, standardDays: 45 };

/** Días de entrega para una cantidad concreta. */
export function leadTimeDaysFor(quantity: number, settings: LeadTimeSettings = DEFAULT_LEAD_TIME): number {
  return quantity <= settings.thresholdUnits ? settings.smallDays : settings.standardDays;
}

/**
 * Plazo de una solicitud: manda la cantidad más grande de todas las piezas
 * (la producción de una solicitud se entrega junta). null si no hay cantidades.
 */
export function leadTimeDaysForQuantities(quantities: readonly (number | null | undefined)[], settings: LeadTimeSettings = DEFAULT_LEAD_TIME): number | null {
  const valid = quantities.filter((q): q is number => typeof q === "number" && Number.isInteger(q) && q > 0);
  if (valid.length === 0) return null;
  return leadTimeDaysFor(Math.max(...valid), settings);
}

/** Fecha de inicio del plazo: el último de anticipo confirmado y proof aprobado. */
export function leadTimeStart(depositConfirmedAt: Date | null, proofApprovedAt: Date | null): Date | null {
  if (!depositConfirmedAt || !proofApprovedAt) return null;
  return depositConfirmedAt > proofApprovedAt ? depositConfirmedAt : proofApprovedAt;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Fecha estimada de entrega a partir del inicio del plazo. */
export function estimatedDeliveryDate(start: Date, days: number): Date {
  return addDays(start, days);
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de Panamá. */
export function todayInPanama(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/**
 * ¿Llega a tiempo? Compara la fecha deseada con "hoy + plazo" (estimación
 * optimista: supone aprobación y anticipo hoy). Devuelve la fecha más temprana
 * posible y si la deseada es anterior.
 */
export function checkDesiredDate(
  desired: string | null | undefined,
  days: number | null,
  today: string = todayInPanama(),
): { earliest: string | null; tooSoon: boolean } {
  const base = parseIsoDate(today);
  if (!base || days === null) return { earliest: null, tooSoon: false };
  const earliest = addDays(base, days).toISOString().slice(0, 10);
  const want = desired ? parseIsoDate(desired) : null;
  return { earliest, tooSoon: want !== null && want.toISOString().slice(0, 10) < earliest };
}
