import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";
import { checkSlaOverdue, processNotificationQueue } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron (vercel.json): avisos de SLA vencido y envío de la cola de
 * notificaciones pendiente. El uso del panel también los dispara (D-054).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  const sla = await checkSlaOverdue();
  const queue = await processNotificationQueue(100);
  log.info("notificaciones procesadas", { sla, ...queue });
  return Response.json({ sla, ...queue });
}
