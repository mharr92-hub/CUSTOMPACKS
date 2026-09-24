import { brand } from "@/config/brand";

/** Límite práctico de wa.me para el texto precargado (evita URLs rechazadas). */
const MAX_TEXT_LENGTH = 1800;

/**
 * Enlace click-to-chat de WhatsApp con texto precargado (MVP, §12).
 * El número sale de NEXT_PUBLIC_WHATSAPP_NUMBER salvo que se pase otro.
 */
export function whatsappLink(text?: string, number: string = brand.whatsappNumber): string {
  const digits = number.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  if (!text) return base;
  const trimmed = text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
  return `${base}?text=${encodeURIComponent(trimmed)}`;
}
