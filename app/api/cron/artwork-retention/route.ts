import { flagExpiredArtwork, flagExpiredRecords } from "@/lib/artwork/retention";
import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron diario (vercel.json): marca el arte, las evidencias y los documentos con
 * la retención vencida (D-115). No borra nada; admin revisa y confirma en
 * /admin/archivos.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  const flagged = await flagExpiredArtwork();
  const records = await flagExpiredRecords();
  log.info("archivos marcados por retención", { flagged, records });
  return Response.json({ flagged, records });
}
