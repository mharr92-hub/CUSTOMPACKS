import { isAuthorizedCron } from "@/lib/cron";
import { log } from "@/lib/log";
import { runDueJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: SLA vencido, vencimiento y recordatorios de cotizaciones, pedidos y
 * envío de la cola de avisos. Lo llama Supabase Cron cada 15 minutos
 * (pnpm cron:install, M6) y el cron diario de vercel.json; cada proceso
 * respeta su intervalo, así que llamarlo seguido no repite trabajo. El uso
 * del panel también los dispara (D-054).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new Response("No autorizado", { status: 401 });
  await runDueJobs({ batch: 100 });
  log.info("procesos programados ejecutados");
  return Response.json({ ok: true });
}
