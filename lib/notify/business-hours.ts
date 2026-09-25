/**
 * Horas hábiles entre dos instantes (SLA de §12: 4 h sin respuesta, 24 h sin
 * cotizar). El horario sale de settings.business_hours: zona horaria, días
 * (1 = lunes … 7 = domingo) y franja "HH:MM"–"HH:MM".
 */
export type BusinessHours = { timezone: string; days: number[]; start: string; end: string };

export const DEFAULT_BUSINESS_HOURS: BusinessHours = { timezone: "America/Panama", days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" };

const MINUTE = 60_000;

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** El instante expresado como "reloj local" de la zona (en milisegundos, como si fuera UTC). */
function localClock(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** Minutos hábiles entre `from` y `to` (0 si to <= from). */
export function businessMinutesBetween(from: Date, to: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  if (to <= from) return 0;
  const open = minutesOf(cfg.start);
  const close = minutesOf(cfg.end);
  if (close <= open) return 0;
  const a0 = localClock(from, cfg.timezone);
  const b0 = localClock(to, cfg.timezone);
  let total = 0;
  const day = new Date(a0);
  day.setUTCHours(0, 0, 0, 0);
  while (day.getTime() <= b0) {
    const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    if (cfg.days.includes(weekday)) {
      const a = Math.max(day.getTime() + open * MINUTE, a0);
      const b = Math.min(day.getTime() + close * MINUTE, b0);
      if (b > a) total += (b - a) / MINUTE;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return Math.floor(total);
}

export function businessHoursBetween(from: Date, to: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): number {
  return businessMinutesBetween(from, to, cfg) / 60;
}

export function parseBusinessHours(value: unknown): BusinessHours {
  if (!value || typeof value !== "object") return DEFAULT_BUSINESS_HOURS;
  const v = value as Partial<BusinessHours>;
  const ok = (s: unknown) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
  return {
    timezone: typeof v.timezone === "string" ? v.timezone : DEFAULT_BUSINESS_HOURS.timezone,
    days: Array.isArray(v.days) && v.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ? v.days : DEFAULT_BUSINESS_HOURS.days,
    start: ok(v.start) ? (v.start as string) : DEFAULT_BUSINESS_HOURS.start,
    end: ok(v.end) ? (v.end as string) : DEFAULT_BUSINESS_HOURS.end,
  };
}
