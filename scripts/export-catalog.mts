// Escribe las plantillas CSV con el catálogo actual de la base, para que Mark
// solo corrija lo que cambia.
// Uso: pnpm catalog:export [carpeta]   (por defecto, catalogo/)
import fs from "node:fs";
import path from "node:path";
import { exportTemplates } from "@/lib/catalog/import-catalog";
import { getSql } from "@/lib/db/client";
import { loadEnvFiles } from "./lib/pg-local.mjs";

const folder = path.resolve(process.argv[2] ?? "catalogo");
await loadEnvFiles();
try {
  const { catalog, samples } = await exportTemplates();
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "plantilla-catalogo.csv"), catalog);
  fs.writeFileSync(path.join(folder, "plantilla-muestras.csv"), samples);
  process.stdout.write(`Plantillas escritas en ${folder}\n`);
} finally {
  await getSql().end({ timeout: 5 });
}
