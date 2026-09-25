import type { NextRequest } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth";
import { clientQuotePdf, quoteFileUrl } from "@/lib/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF de la cotización. El cliente entra con el token de su enlace (?t=…) y
 * solo abre cotizaciones emitidas de su solicitud; el equipo, con sesión.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documentos/cotizacion/[id]">) {
  const { id } = await ctx.params;
  const token = request.nextUrl.searchParams.get("t");
  if (token) {
    const file = await clientQuotePdf(token, id);
    if (!file) return new Response("No encontrado", { status: 404 });
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${file.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const user = await getCurrentUser();
  if (!user?.isActive || !isStaffRole(user.role)) return new Response("No encontrado", { status: 404 });
  const url = await quoteFileUrl(user, id);
  if (!url) return new Response("No encontrado", { status: 404 });
  return Response.redirect(new URL(url, request.nextUrl.origin), 302);
}
