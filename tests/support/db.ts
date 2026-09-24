import postgres from "postgres";
import { inject } from "vitest";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

let shared: Sql | null = null;

/** Conexión (superusuario) a la base efímera de los tests de tests/db. */
export function testSql(): Sql {
  if (!shared) shared = postgres(inject("databaseUrl"), { max: 4, onnotice: () => {} });
  return shared;
}

export async function closeTestSql(): Promise<void> {
  if (shared) await shared.end({ timeout: 5 });
  shared = null;
}

class Rollback extends Error {}

/**
 * Ejecuta `fn` con el rol y claims indicados (como lib/db/actor.ts) dentro de
 * una transacción que siempre se revierte, para no ensuciar la base.
 */
export async function asActor<T>(
  actor: { kind: "anon"; accessToken?: string } | { kind: "user"; userId: string } | { kind: "service" },
  fn: (tx: Tx) => Promise<T>,
  opts: { commit?: boolean } = {},
): Promise<T> {
  let out: T | undefined;
  try {
    await testSql().begin(async (tx) => {
      if (actor.kind !== "service") {
        const claims = actor.kind === "user" ? { sub: actor.userId, role: "authenticated" } : { role: "anon" };
        const token = actor.kind === "anon" ? (actor.accessToken ?? "") : "";
        await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true), set_config('app.access_token', ${token}, true)`;
        await tx.unsafe(actor.kind === "user" ? "set local role authenticated" : "set local role anon");
      }
      out = await fn(tx);
      if (!opts.commit) throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return out as T;
}

/** Crea un usuario en auth.users (dispara el perfil) y opcionalmente fija su rol. */
export async function createUser(email: string, role?: "admin" | "sales" | "ops" | "viewer" | "client"): Promise<string> {
  const sql = testSql();
  const [user] = await sql<{ id: string }[]>`insert into auth.users (email) values (${email}) returning id`;
  if (!user) throw new Error("no se creó el usuario");
  if (role) await sql`update public.profiles set role = ${role} where user_id = ${user.id}`;
  return user.id;
}
