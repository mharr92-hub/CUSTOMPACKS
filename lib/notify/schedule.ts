/**
 * Recordatorios programados de §12 (días calendario en la zona de Panamá):
 * - Vigencia: a 3 y 1 día del vencimiento de la cotización.
 * - Saldo: a los 2 y 5 días de la entrega.
 * - Encuesta NPS: a los 7 días del cierre.
 * Funciones puras: dado "ahora" dicen qué recordatorio toca. Las usan los
 * procesos de cotizaciones (E7) y pedidos (E8); los duplicados los evita la
 * clave única de cada notificación.
 */
const DAY = 24 * 60 * 60 * 1000;

function localDay(date: Date, timezone: string): number {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return Date.parse(`${iso}T00:00:00Z`) / DAY;
}

/** Días calendario de `from` a `to` en la zona dada. */
export function daysBetween(from: Date, to: Date, timezone = "America/Panama"): number {
  return localDay(to, timezone) - localDay(from, timezone);
}

/** Recordatorio de vigencia que toca hoy (3 o 1 día antes), o null. */
export function expiryReminderDue(expiresAt: Date, now: Date, daysBefore: readonly number[] = [3, 1]): number | null {
  const left = daysBetween(now, expiresAt);
  return daysBefore.includes(left) ? left : null;
}

/** Recordatorio de saldo que toca hoy (2 o 5 días después de la entrega), o null. */
export function balanceReminderDue(deliveredAt: Date, now: Date, daysAfter: readonly number[] = [2, 5]): number | null {
  const since = daysBetween(deliveredAt, now);
  return daysAfter.includes(since) ? since : null;
}

/** ¿Toca la encuesta NPS? (desde el día 7 después del cierre; si el proceso no corrió ese día, al siguiente). */
export function npsDue(closedAt: Date, now: Date, delayDays = 7): boolean {
  return daysBetween(closedAt, now) >= delayDays;
}
