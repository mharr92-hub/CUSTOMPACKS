import { absoluteUrl } from "@/lib/urls";

/** Enlaces del cotizador (sirven en servidor y navegador). */
export function resumeLink(draftToken: string): string {
  return absoluteUrl(`/cotizar?borrador=${draftToken}`);
}

export function trackingPath(accessToken: string): string {
  return `/seguimiento/${accessToken}`;
}

export function specPdfPath(requestId: string, accessToken?: string): string {
  return accessToken ? `/api/pdf/ficha/${requestId}?t=${accessToken}` : `/api/pdf/ficha/${requestId}`;
}

/** Cookie httpOnly con el token de la última solicitud enviada (página de confirmación). */
export const CONFIRMATION_COOKIE = "pp_listo";
