// Importa fotos de la galería desde una carpeta de escaneos.
// Uso:
//   pnpm gallery:import <carpeta> [--orden <archivo.csv>] [--crear] [--prueba]
//     --orden   CSV que dice qué código lleva cada foto (si los archivos no se
//               llaman M-001.jpg): columnas archivo, pagina y codigo, o solo codigo
//     --crear   crea las muestras que falten (inactivas y PROVISIONAL)
//     --prueba  muestra qué haría sin subir ni cambiar nada
// Acepta JPG, PNG, WebP y PDF de varias páginas; recorta el margen blanco,
// convierte a WebP y genera miniaturas. Usa la misma base y almacenamiento que
// la app (.env.local o variables de entorno). Detalle en
// docs/CATALOGO-COMO-LLENARLO.md.
import path from "node:path";
import { importGalleryFolder } from "@/lib/catalog/import-gallery";
import { getSql } from "@/lib/db/client";
import { loadEnvFiles } from "./lib/pg-local.mjs";

const args = process.argv.slice(2);
const orderIndex = args.indexOf("--orden");
const order = orderIndex >= 0 ? args[orderIndex + 1] : undefined;
const folder = args.find((a, i) => !a.startsWith("--") && (orderIndex < 0 || i !== orderIndex + 1));
if (!folder || (orderIndex >= 0 && !order)) {
  process.stderr.write("uso: pnpm gallery:import <carpeta> [--orden <archivo.csv>] [--crear] [--prueba]\n");
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
  name: "el nombre no es M-000.jpg / M-000-2.jpg (o usa --orden)",
  type: "no es una imagen JPG, PNG, WebP ni un PDF válido",
  size: "pesa más de 80 MB",
  missing: "no existe esa muestra (créala en el panel, cárgala con pnpm catalog:import o usa --crear)",
  order: "el CSV de orden no le asigna ningún código",
  pdf: "no se pudo leer el PDF",
} as const;

try {
  const results = await importGalleryFolder(path.resolve(folder), {
    create: args.includes("--crear"),
    dryRun: args.includes("--prueba"),
    order: order ? path.resolve(order) : undefined,
  });
  for (const r of results) {
    const detail = r.status === "skipped" ? `${LABEL.skipped}: ${REASON[r.reason]}` : LABEL[r.status];
    const name = r.page ? `${r.file} (pág. ${r.page})` : r.file;
    process.stdout.write(`${name.padEnd(32)} ${(r.code ?? "—").padEnd(8)} ${detail}\n`);
  }
  const done = results.filter((r) => r.status !== "skipped" && r.status !== "unchanged").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  process.stdout.write(
    args.includes("--prueba")
      ? `\nPrueba: se cargarían ${done} fotos y se omitirían ${skipped}. No se cambió nada.\n`
      : `\n${done} fotos cargadas, ${skipped} omitidas. Se ven en el sitio en unos 5 minutos.\n`,
  );
  if (skipped > 0) process.exitCode = 1;
} finally {
  await getSql().end({ timeout: 5 });
}
