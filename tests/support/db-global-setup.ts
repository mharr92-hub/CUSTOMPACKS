import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { connect, migrate, seed, startEmbedded, type EmbeddedHandle } from "../../scripts/lib/pg-local.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Levanta un Postgres embebido efímero (puerto y carpeta temporales), aplica
 * shim + migraciones + seed y expone la URL a los tests de tests/db.
 * Si TEST_DATABASE_URL está definido (por ejemplo, un servicio Postgres en
 * CI), lo usa en lugar del embebido.
 */
export default async function setup(project: TestProject) {
  let pg: EmbeddedHandle | null = null;
  let dataDir: string | null = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-pg-"));
    const port = 55000 + Math.floor(Math.random() * 2000);
    const started = await startEmbedded({ dataDir, port, persistent: false });
    pg = started.pg;
    url = started.url;
  }
  const sql = connect(url);
  try {
    await migrate(sql);
    await seed(sql, { adminEmail: "admin@test.local" });
  } finally {
    await sql.end({ timeout: 5 });
  }
  project.provide("databaseUrl", url);
  return async () => {
    if (pg) await pg.stop();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
