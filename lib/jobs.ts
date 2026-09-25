import "server-only";
import { checkSlaOverdue, claimJob, processNotificationQueue } from "@/lib/notify";
import { balanceReminders, npsSurveys } from "@/lib/orders";
import { expireQuotes, quoteExpiryReminders } from "@/lib/quotes";
import { purgeRateLimits } from "@/lib/rate-limit";

/**
 * Procesos programados (D-054): SLA cada 10 minutos; cada hora, cotizaciones
 * (vencimiento y recordatorios de vigencia) y pedidos (recordatorio de saldo y
 * encuesta NPS); la cola de avisos en cada pasada.
 * Los llama el cron diario y el uso del panel.
 */
export async function runDueJobs(opts: { force?: boolean } = {}): Promise<void> {
  if (opts.force || (await claimJob("sla", 10))) await checkSlaOverdue();
  if (opts.force || (await claimJob("quotes", 60))) {
    await expireQuotes();
    await quoteExpiryReminders();
  }
  if (opts.force || (await claimJob("orders", 60))) {
    await balanceReminders();
    await npsSurveys();
  }
  if (opts.force || (await claimJob("rate_limits", 1440))) await purgeRateLimits();
  await processNotificationQueue(opts.force ? 100 : 25);
}
