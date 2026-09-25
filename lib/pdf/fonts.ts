import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

/** Inter local para los PDF (sin depender de servicios externos). */
export function registerPdfFonts(): void {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(dir, "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "inter-latin-800-normal.woff"), fontWeight: 800 },
    ],
  });
  // Sin cortes de palabra con guiones (los textos son cortos).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
