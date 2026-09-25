import "server-only";
import { checkSlaOverdue, claimJob, processNotificationQueue } from "@/lib/notify";
import { expireQuotes, quoteExpiryReminders } from "@/lib/quotes";

/**
 * Procesos programados (D-054): SLA cada 10 minutos, cotizaciones (vencimiento
 * y recordatorios de vigencia) cada hora, y la cola de avisos en cada pasada.
 * Los llama el cron diario y el uso del panel.
 */
export async function runDueJobs(opts: { force?: boolean } = {}): Promise<void> {
  if (opts.force || (await claimJob("sla", 10))) await checkSlaOverdue();
  if (opts.force || (await claimJob("quotes", 60))) {
    await expireQuotes();
    await quoteExpiryReminders();
  }
  await processNotificationQueue(opts.force ? 100 : 25);
}
