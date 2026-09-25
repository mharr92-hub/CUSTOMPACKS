import type { NextRequest } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getReports, REPORT_KEYS, resolveRange, type ReportKey } from "@/lib/panel/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV de un reporte del panel (solo equipo), listo para Google Sheets. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/reportes/[reporte]">) {
  const { reporte } = await ctx.params;
  const user = await getCurrentUser();
  if (!user?.isActive || !isStaffRole(user.role)) return new Response("No autorizado", { status: 401 });
  if (!(REPORT_KEYS as readonly string[]).includes(reporte)) return new Response("No encontrado", { status: 404 });
  const range = resolveRange({ from: request.nextUrl.searchParams.get("desde"), to: request.nextUrl.searchParams.get("hasta") });
  const [table] = await getReports(user, range, reporte as ReportKey);
  if (!table) return new Response("No encontrado", { status: 404 });
  const csv = toCsv(
    table.columns.map((c) => c.label),
    table.rows,
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-${reporte}-${range.from}-a-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
