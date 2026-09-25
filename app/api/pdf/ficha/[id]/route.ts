import type { NextRequest } from "next/server";
import { actorFor, getCurrentUser, isStaffRole } from "@/lib/auth";
import { getPublicCatalog, quoteConditions } from "@/lib/catalog/public";
import { log } from "@/lib/log";
import { renderSpecSheetPdf } from "@/lib/pdf/spec-sheet";
import { getRequestByToken, getRequestForUser, type TrackingRequest } from "@/lib/quote/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ficha técnica en PDF. Acceso: el cliente con el token de su enlace seguro
 * (?t=…) o un usuario del equipo con sesión. Nunca contiene precios.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/pdf/ficha/[id]">) {
  const { id } = await ctx.params;
  const token = request.nextUrl.searchParams.get("t");
  let data: TrackingRequest | null = null;
  if (token) {
    const byToken = await getRequestByToken(token);
    data = byToken && byToken.id === id ? byToken : null;
  } else {
    const user = await getCurrentUser();
    if (user && user.isActive && isStaffRole(user.role)) data = await getRequestForUser(actorFor(user), id);
  }
  if (!data) return new Response("No encontrado", { status: 404 });

  try {
    const catalog = await getPublicCatalog();
    const pdf = await renderSpecSheetPdf(data, quoteConditions(catalog));
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${data.number}-ficha-tecnica.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    log.error("no se pudo generar la ficha PDF", { error, id });
    return new Response("Error al generar el PDF", { status: 500 });
  }
}
