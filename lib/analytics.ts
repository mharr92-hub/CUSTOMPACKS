/**
 * Eventos de analytics (GA4 y Meta Pixel). Si los scripts no están cargados
 * (faltan NEXT_PUBLIC_GA_ID / NEXT_PUBLIC_META_PIXEL_ID), no hace nada.
 */
type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", event, params);
    window.fbq?.("trackCustom", event, params);
  } catch {
    // los analytics nunca deben romper la experiencia
  }
}

/** Evento estándar de Meta para la solicitud enviada (optimización de campañas). */
export function trackLead(params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", "generate_lead", params);
    window.fbq?.("track", "Lead", params);
  } catch {
    // ignorar
  }
}
