import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Solo para la prueba e2e de la pantalla de error (M1). Sin
 * ENABLE_ERROR_TEST_ROUTE=1 no existe: responde 404.
 */
export default function ErrorTestPage(): never {
  if (process.env.ENABLE_ERROR_TEST_ROUTE !== "1") notFound();
  throw new Error("Error de prueba de la pantalla de error");
}
