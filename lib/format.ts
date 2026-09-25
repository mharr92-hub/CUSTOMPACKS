/**
 * Fechas visibles: día y mes con nombre, así "24 sept 2026" no se confunde
 * entre el formato día/mes y el mes/día que Intl usa para es-PA (D-047).
 */
const TZ = "America/Panama";

const dateTime = new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });

export function formatDateTime(value: Date | string): string {
  return dateTime.format(typeof value === "string" ? new Date(value) : value);
}

export function formatDate(value: Date | string): string {
  return dateOnly.format(typeof value === "string" ? new Date(value) : value);
}
