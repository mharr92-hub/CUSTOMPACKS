import { flagExpiredArtwork } from "@/lib/artwork/retention";
import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron diario (vercel.json): marca el arte con la retención vencida. No borra
 * nada; admin revisa y confirma en /admin/archivos.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  const flagged = await flagExpiredArtwork();
  log.info("arte marcado por retención", { flagged });
  return Response.json({ flagged });
}
