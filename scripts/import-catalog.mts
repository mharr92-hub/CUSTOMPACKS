// Carga o actualiza el catálogo real desde las plantillas CSV.
// Uso:
//   pnpm catalog:import <plantilla.csv> [<otra.csv>…] [--fotos <carpeta>] [--prueba]
//     --fotos   carpeta con las fotos de la columna "archivo de foto"
//               (por defecto, la carpeta "fotos" junto al primer CSV)
//     --prueba  valida y muestra qué haría, sin cambiar nada
// Valida todo antes de cargar: si hay un solo error, no se carga nada. Nunca
// borra filas ni toca solicitudes. Detalle en docs/CATALOGO-COMO-LLENARLO.md.
import path from "node:path";
import { importCatalog } from "@/lib/catalog/import-catalog";
import { getSql } from "@/lib/db/client";
import { loadEnvFiles } from "./lib/pg-local.mjs";

const args = process.argv.slice(2);
const fotosIndex = args.indexOf("--fotos");
const files = args.filter((a, i) => !a.startsWith("--") && (fotosIndex < 0 || i !== fotosIndex + 1));
if (files.length === 0 || (fotosIndex >= 0 && !args[fotosIndex + 1])) {
  process.stderr.write("uso: pnpm catalog:import <plantilla.csv> [<otra.csv>…] [--fotos <carpeta>] [--prueba]\n");
  process.exit(2);
}
const dryRun = args.includes("--prueba");
const photosDir = path.resolve(fotosIndex >= 0 ? args[fotosIndex + 1]! : path.join(path.dirname(path.resolve(files[0]!)), "fotos"));

await loadEnvFiles();
try {
  const report = await importCatalog(files.map((f) => path.resolve(f)), { photosDir, dryRun });
  if (report.issues.length > 0) {
    process.stdout.write(`\nHay ${report.issues.length} errores. No se cargó nada; corrígelos y vuelve a correr el comando.\n\n`);
    for (const i of report.issues) {
      const where = [i.file, i.line ? `fila ${i.line}` : null, i.code].filter(Boolean).join(" · ");
      process.stdout.write(`  ✗ ${where}: ${i.message}\n`);
    }
  }
  if (report.warnings.length > 0) {
    process.stdout.write("\nAvisos (no impiden la carga):\n");
    for (const w of report.warnings) process.stdout.write(`  • ${w}\n`);
  }
  if (report.issues.length === 0) {
    const summary = `${report.created} nuevos, ${report.updated} actualizados, ${report.rules} reglas de compatibilidad, ${report.photos} fotos`;
    process.stdout.write(
      dryRun ? `\nPrueba sin errores: se cargarían ${summary}. No se cambió nada.\n` : `\nListo: ${summary}. Se ve en el sitio en unos 5 minutos.\n`,
    );
  }
  process.exitCode = report.issues.length > 0 ? 1 : 0;
} finally {
  await getSql().end({ timeout: 5 });
}
