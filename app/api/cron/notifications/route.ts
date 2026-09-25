import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";
import { runDueJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron (vercel.json): SLA vencido, vencimiento y recordatorios de
 * cotizaciones, y envío de la cola de avisos. El uso del panel también los
 * dispara (D-054).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  await runDueJobs({ force: true });
  log.info("procesos programados ejecutados");
  return Response.json({ ok: true });
}
