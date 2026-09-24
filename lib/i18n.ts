import { createTranslator } from "next-intl";
import messages from "@/messages/es.json";

/**
 * Traductor para código fuera de componentes (correos, PDFs, crons, rutas
 * API). Lee los mismos textos de messages/es.json que la interfaz.
 */
export function serverT<N extends keyof typeof messages>(namespace: N) {
  return createTranslator({ locale: "es", messages, namespace });
}

export type Messages = typeof messages;
