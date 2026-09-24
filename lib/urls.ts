import { brand } from "@/config/brand";

/** Convierte una ruta relativa del sitio en URL absoluta (correos, PDFs, WhatsApp). */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${brand.siteUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/**
 * Sanea un destino de redirección recibido por query (?next=): solo rutas
 * internas, nunca otro dominio.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
