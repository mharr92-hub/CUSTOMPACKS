// Entorno para correr código de lib/ fuera de Next.js con tsx:
//   tsx --import ./scripts/lib/script-env.mjs scripts/<script>.mts
// - `server-only` se resuelve a un módulo vacío (fuera de React Server
//   Components el paquete original lanza un error a propósito).
// - Paquetes ESM que solo exportan para `import` (p. ej. @react-pdf/hyphenate):
//   tsx carga lib/ como CommonJS y la resolución falla; se reintenta con las
//   condiciones de `import`.
// - PROVENPACK_SCRIPT=1: el catálogo se lee sin la caché incremental de Next.
import { registerHooks } from "node:module";

const shim = new URL("./server-only-shim.mjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: shim, format: "module", shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
      return nextResolve(specifier, { ...context, conditions: ["node", "import", "default"] });
    }
  },
});
process.env.PROVENPACK_SCRIPT = "1";
