import "server-only";
import type { Tx } from "@/lib/db/client";
import { createOrderFromQuote } from "./index";

/**
 * Gancho al aceptar una cotización (TAREAS E7): corre dentro de la misma
 * transacción que registra la aceptación y crea el pedido (E8).
 */
export async function onQuoteAccepted(tx: Tx, quoteId: string): Promise<void> {
  await createOrderFromQuote(tx, quoteId);
}
