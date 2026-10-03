import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportPersonalData } from "@/lib/panel/personal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exportación de los datos de una persona (Ley 81, derecho de acceso). Solo admin. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isActive || user.role !== "admin") return new Response("No autorizado", { status: 401 });
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const data = await exportPersonalData(user, q);
  if (!data) return new Response("Consulta inválida", { status: 400 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="datos-personales.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
