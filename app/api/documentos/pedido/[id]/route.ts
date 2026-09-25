import type { NextRequest } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth";
import { getOrder, getOrderForToken } from "@/lib/orders";
import { getPublicCatalog, taxLabel } from "@/lib/catalog/public";
import { renderStatementPdf } from "@/lib/orders/statement-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de pagos del pedido en PDF. El cliente entra con el token de su
 * enlace (?t=…) y solo abre su pedido; el equipo, con sesión.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/documentos/pedido/[id]">) {
  const { id } = await ctx.params;
  const token = request.nextUrl.searchParams.get("t");
  let order = null;
  if (token) {
    order = await getOrderForToken(token, id);
  } else {
    const user = await getCurrentUser();
    if (user?.isActive && isStaffRole(user.role)) order = await getOrder(user, id);
  }
  if (!order) return new Response("No encontrado", { status: 404 });
  const pdf = await renderStatementPdf(order, taxLabel(await getPublicCatalog()));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${order.number}-estado-de-pagos.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
