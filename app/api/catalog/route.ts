import { getPublicCatalog } from "@/lib/catalog/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** API pública de solo lectura con el catálogo activo (sin datos internos ni precios). */
export async function GET() {
  const catalog = await getPublicCatalog();
  return Response.json(catalog, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
