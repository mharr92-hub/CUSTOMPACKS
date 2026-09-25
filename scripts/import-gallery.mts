// Importa fotos de la galería desde una carpeta (M-001.jpg, M-001-2.jpg…).
// Uso:
//   pnpm gallery:import <carpeta> [--crear] [--prueba]
//     --crear   crea las muestras que falten (inactivas y PROVISIONAL)
//     --prueba  muestra qué haría sin subir ni cambiar nada
// Usa la misma base y almacenamiento que la app (.env.local o variables de entorno).
// Detalle en docs/lanzamiento.md.
import path from "node:path";
import { importGalleryFolder } from "@/lib/catalog/import-gallery";
import { getSql } from "@/lib/db/client";
import { loadEnvFiles } from "./lib/pg-local.mjs";

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
if (!folder) {
  process.stderr.write("uso: pnpm gallery:import <carpeta> [--crear] [--prueba]\n");
  process.exit(2);
}

await loadEnvFiles();
const LABEL = {
  main: "foto principal",
  extra: "foto adicional",
  unchanged: "sin cambios (ya estaba)",
  created: "muestra creada (inactiva, completar en el panel)",
  skipped: "omitida",
} as const;
const REASON = {
  name: "el nombre no es M-000.jpg / M-000-2.jpg",
  type: "no es una imagen JPG, PNG o WebP válida",
  size: "pesa más de 10 MB",
  missing: "no existe esa muestra (créala en el panel o usa --crear)",
} as const;

try {
  const results = await importGalleryFolder(path.resolve(folder), { create: args.includes("--crear"), dryRun: args.includes("--prueba") });
  for (const r of results) {
    const detail = r.status === "skipped" ? `${LABEL.skipped}: ${REASON[r.reason]}` : LABEL[r.status];
    process.stdout.write(`${r.file.padEnd(24)} ${r.code ?? "—"}  ${detail}\n`);
  }
  const done = results.filter((r) => r.status !== "skipped" && r.status !== "unchanged").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  process.stdout.write(
    args.includes("--prueba")
      ? `\nPrueba: se cargarían ${done} fotos y se omitirían ${skipped}. No se cambió nada.\n`
      : `\n${done} fotos cargadas, ${skipped} omitidas. Se ven en el sitio en unos 5 minutos.\n`,
  );
} finally {
  await getSql().end({ timeout: 5 });
}
