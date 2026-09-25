import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";
import { purgeExpiredDrafts } from "@/lib/quote/drafts";
import { removePrefix } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron diario (vercel.json): borra los borradores del cotizador vencidos que
 * nunca se enviaron, con sus archivos subidos (datos personales sin
 * solicitud; Ley 81 de 2019). Las solicitudes enviadas no se tocan.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  const tokens = await purgeExpiredDrafts();
  let files = 0;
  for (const token of tokens) {
    try {
      files += await removePrefix("artwork", `drafts/${token}`);
    } catch (error) {
      log.error("no se pudieron borrar los archivos de un borrador vencido", { error });
    }
  }
  log.info("borradores vencidos eliminados", { drafts: tokens.length, files });
  return Response.json({ drafts: tokens.length, files });
}
