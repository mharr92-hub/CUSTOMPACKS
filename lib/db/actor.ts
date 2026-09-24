import "server-only";
import { getSql, type Tx } from "./client";

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
