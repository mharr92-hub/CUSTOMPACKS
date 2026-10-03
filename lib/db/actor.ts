import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { log } from "@/lib/log";
import { getSql, type Tx } from "./client";

/**
 * Marca de "dentro de una transacción" (DAT-01). Una transacción abierta
 * dentro de otra pide una segunda conexión mientras retiene la primera: con
 * DB_POOL_MAX=1 (producción en Vercel) se queda esperando para siempre. La
 * marca se apaga al terminar, así que lo que se agenda con after() no cuenta.
 */
const openTx = new AsyncLocalStorage<{ active: boolean }>();

function guardNesting() {
  if (!openTx.getStore()?.active) return;
  const message = "withActor anidado: una transacción se abrió dentro de otra (bloquea el pool con DB_POOL_MAX=1)";
  if (process.env.NODE_ENV === "production") log.error(message, { stack: new Error(message).stack });
  else throw new Error(message);
}

/**
 * Quién ejecuta la consulta. Las políticas RLS se evalúan igual que en
 * Supabase: el rol de Postgres y `request.jwt.claims` se fijan con SET LOCAL
 * dentro de la transacción, así que `auth.uid()` funciona en ambos entornos.
 *
 * - anon: visitante. `accessToken` habilita lo que las políticas permiten por
 *   enlace seguro (seguimiento, borrador), vía `app.access_token`.
 * - user: usuario autenticado (staff o cliente con cuenta).
 * - service: procesos de servidor de confianza (cron, webhooks). Omite RLS;
 *   usarlo solo después de validar permisos en código.
 */
export type Actor =
  | { kind: "anon"; accessToken?: string | null }
  | { kind: "user"; userId: string; email?: string | null }
  | { kind: "service" };

export const anonActor: Actor = { kind: "anon" };
export const serviceActor: Actor = { kind: "service" };

export async function withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  guardNesting();
  const store = { active: true };
  try {
    return await openTx.run(store, () => runInTransaction(actor, fn));
  } finally {
    store.active = false;
  }
}

async function runInTransaction<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sql = getSql();
  const result = await sql.begin(async (tx) => {
    if (actor.kind !== "service") {
      const claims =
        actor.kind === "user"
          ? { sub: actor.userId, email: actor.email ?? undefined, role: "authenticated" }
          : { role: "anon" };
      const token = actor.kind === "anon" ? (actor.accessToken ?? "") : "";
      await tx`
        select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
               set_config('app.access_token', ${token}, true)`;
      await tx.unsafe(actor.kind === "user" ? "set local role authenticated" : "set local role anon");
    }
    return fn(tx);
  });
  return result as T;
}

/**
 * Marca la transacción como un cambio de estado hecho por el sistema (enviar
 * el RFQ, emitir la cotización): sin esta marca, la base no deja que un
 * usuario pase la solicitud a "RFQ enviado", "Cotizada" o "Aceptada"
 * (migración 013).
 */
export async function markSystemTransition(tx: Tx): Promise<void> {
  await tx`select set_config('app.system_transition', 'on', true)`;
}
