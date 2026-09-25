import "server-only";
import type { Tx } from "@/lib/db/client";

/**
 * Gancho al aceptar una cotización (TAREAS E7): corre dentro de la misma
 * transacción que registra la aceptación. E8 crea aquí el pedido.
 */
export async function onQuoteAccepted(tx: Tx, quoteId: string): Promise<void> {
  void tx;
  void quoteId;
}
