import "server-only";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __provenpackSql?: Sql };

/**
 * Pool único por proceso (se guarda en globalThis para sobrevivir al HMR de
 * `next dev`). Con el pooler de Supabase en modo transacción no se pueden usar
 * sentencias preparadas, por eso `prepare` solo se activa en la base local.
 */
export function getSql(): Sql {
  if (!globalForDb.__provenpackSql) {
    const env = getServerEnv();
    globalForDb.__provenpackSql = postgres(env.databaseUrl, {
      max: env.dbPoolMax,
      prepare: env.isLocalDatabase,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      connection: { application_name: "provenpack" },
    });
  }
  return globalForDb.__provenpackSql;
}
