import "server-only";
import { after } from "next/server";
import { brand } from "@/config/brand";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { serverT } from "@/lib/i18n";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/mail";
import type { ItemSpec } from "@/lib/quote/spec";
import { absoluteUrl } from "@/lib/urls";
import { whatsappLink } from "@/lib/whatsapp";
import { businessHoursBetween, parseBusinessHours } from "./business-hours";
import { emailLayout, missingVariables, renderHtml, renderText, type TemplateVars } from "./render";

/**
 * Notificaciones (PRD §12). La base encola un mensaje por plantilla activa en
 * cada evento (triggers de 005_notifications); aquí se redactan con la
 * plantilla vigente y se envían:
 * - Correo por Resend; sin RESEND_API_KEY queda "simulated" y se ve en consola.
 * - WhatsApp en el MVP es click-to-chat: se arma el enlace wa.me con el texto
 *   y queda "simulated" hasta que el equipo lo abre y lo marca enviado.
 * Cada envío queda en `activities` de la solicitud.
 */
export type NotificationStatus = "queued" | "sent" | "simulated" | "failed";
type Channel = "email" | "whatsapp";

type QueueRow = {
  id: string;
  event: string;
  template_code: string;
  request_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  audience: "client" | "team";
  channel: Channel;
  recipient: string;
  payload: { reason?: string | null; item_id?: string; vars?: Record<string, string | number> };
  attempts: number;
};

const MAX_ATTEMPTS = 3;

/** Encola un evento a mano (procesos programados, E7 y E8). Devuelve cuántos mensajes se encolaron. */
export async function enqueueNotification(
  event: string,
  requestId: string | null,
  opts: { entityType?: string; entityId?: string; vars?: Record<string, string | number>; dedupe?: string } = {},
): Promise<number> {
  const [row] = await withActor(serviceActor, (tx) => tx<{ n: number }[]>`
    select public.enqueue_notifications(${event}, ${requestId}::uuid, ${opts.entityType ?? null}, ${opts.entityId ?? null}::uuid,
      ${tx.json({ vars: opts.vars ?? {} })}, ${opts.dedupe ?? null}) as n`);
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Variables de cada mensaje
// ---------------------------------------------------------------------------
type RequestRow = {
  id: string;
  number: string;
  access_token: string;
  contact_name: string;
  company_name: string | null;
  segment: "commercial" | "food" | "unsure";
  traffic_light: "green" | "yellow" | "red";
  missing_fields: string[];
};

async function requestVariables(tx: Tx, n: QueueRow): Promise<TemplateVars> {
  const t = serverT("notify");
  if (!n.request_id) return {};
  const [r] = await tx<RequestRow[]>`
    select id, number, access_token, contact_name, company_name, segment, traffic_light, missing_fields
      from public.quote_requests where id = ${n.request_id}`;
  if (!r) return {};
  const items = await tx<{ id: string; position: number; spec_snapshot: ItemSpec }[]>`
    select id, position, spec_snapshot from public.quote_items where request_id = ${r.id} order by position`;
  const pieceName = (it: { position: number; spec_snapshot: ItemSpec }) => it.spec_snapshot?.type?.name ?? t("piece", { n: it.position });
  const target = n.payload.item_id ? items.find((i) => i.id === n.payload.item_id) : undefined;
  const pieces = target ? pieceName(target) : items.map(pieceName).join(", ") || items[0]?.spec_snapshot?.product?.name || t("yourPackaging");
  const missing = (r.missing_fields ?? [])
    .map((m) => {
      const [pos, field] = m.split(":");
      const label = t.has(`field.${field}` as never) ? t(`field.${field}` as "field.type") : field;
      return items.length > 1 ? t("pieceField", { field: label ?? "", n: pos ?? "" }) : label;
    })
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(", ");
  return {
    nombre: r.contact_name.trim().split(/\s+/)[0] ?? r.contact_name,
    numero: r.number,
    pieza: pieces,
    empresa: r.company_name || r.contact_name,
    segmento: t(`segment.${r.segment}`),
    semaforo: t(`light.${r.traffic_light}`),
    lista: n.payload.reason?.trim() || missing,
    enlace: absoluteUrl(`/seguimiento/${r.access_token}`),
    enlace_panel: absoluteUrl(`/admin/solicitudes/${r.id}`),
  };
}

// ---------------------------------------------------------------------------
// Procesar la cola
// ---------------------------------------------------------------------------
export type QueueResult = { processed: number; sent: number; simulated: number; failed: number; retry: number };

/** Toma mensajes en cola (con bloqueo para no enviar dos veces), los redacta y los envía. */
export async function processNotificationQueue(limit = 25): Promise<QueueResult> {
  const result: QueueResult = { processed: 0, sent: 0, simulated: 0, failed: 0, retry: 0 };
  const rows = await withActor(serviceActor, (tx) => tx<QueueRow[]>`
    update public.notifications n
       set locked_until = now() + interval '2 minutes', attempts = n.attempts + 1, updated_at = now()
     where n.id in (
       select id from public.notifications
        where status = 'queued' and (locked_until is null or locked_until < now())
        order by created_at
        limit ${limit}
        for update skip locked)
    returning n.id, n.event, n.template_code, n.request_id, n.entity_type, n.entity_id, n.audience, n.channel, n.recipient, n.payload, n.attempts`);
  for (const n of rows) {
    result.processed += 1;
    const outcome: Outcome = await deliver(n).catch((error: unknown): Outcome => {
      log.error("no se pudo procesar una notificación", { error, id: n.id });
      return { status: "queued" as const, error: error instanceof Error ? error.message : String(error) };
    });
    const finalStatus: NotificationStatus = outcome.status === "queued" && n.attempts >= MAX_ATTEMPTS ? "failed" : outcome.status;
    if (finalStatus === "queued") result.retry += 1;
    else result[finalStatus] += 1;
    await withActor(serviceActor, async (tx) => {
      await tx`
        update public.notifications
           set status = ${finalStatus}, subject = ${outcome.subject ?? null}, body = ${outcome.body ?? null}, wa_link = ${outcome.waLink ?? null},
               error = ${outcome.error ?? null}, locked_until = null, updated_at = now(),
               sent_at = ${finalStatus === "sent" || finalStatus === "simulated" ? tx`now()` : null}
         where id = ${n.id}`;
      if (finalStatus !== "queued" && n.request_id) {
        await tx`
          insert into public.activities (request_id, entity_type, entity_id, channel, kind, body, payload)
          values (${n.request_id}, 'notification', ${n.id}, ${n.channel}, 'notification', ${n.template_code},
                  ${tx.json({ event: n.event, status: finalStatus, audience: n.audience, error: outcome.error ?? null })})`;
      }
    });
  }
  return result;
}

type Outcome = { status: NotificationStatus; subject?: string | null; body?: string | null; waLink?: string | null; error?: string | null };

async function deliver(n: QueueRow): Promise<Outcome> {
  const t = serverT("notify");
  const { template, vars } = await withActor(serviceActor, async (tx) => {
    const [template] = await tx<{ name: string; subject: string | null; body: string; is_active: boolean }[]>`
      select name, subject, body, is_active from public.message_templates where code = ${n.template_code} and channel = ${n.channel}`;
    return { template, vars: { ...(await requestVariables(tx, n)), ...(n.payload.vars ?? {}) } };
  });
  if (!template?.is_active) return { status: "failed", error: t("inactive") };
  const missing = missingVariables([template.subject, template.body], vars);
  if (missing.length) return { status: "failed", error: t("missing", { vars: missing.join(", ") }) };

  const text = renderText(template.body, vars);
  if (n.channel === "whatsapp") {
    const link = whatsappLink(text, n.recipient);
    log.info("WhatsApp listo para enviar (click-to-chat)", { to: n.recipient, template: n.template_code, link });
    return { status: "simulated", body: text, waLink: link };
  }
  const subject = renderText(template.subject ?? template.name, vars);
  const footer = n.audience === "team" ? t("footerTeam", { brand: brand.name }) : t("footerClient", { brand: brand.name, numero: String(vars.numero ?? "") });
  const sent = await sendEmail({
    to: n.recipient,
    subject,
    text: `${text}\n\n${footer}`,
    html: emailLayout({ brand: brand.name, html: renderHtml(template.body, vars), footer }),
  });
  if (sent.status === "failed") return { status: "queued", subject, body: text, error: sent.error };
  return { status: sent.status, subject, body: text };
}

/**
 * Envía la cola cuando termina la respuesta actual (no demora a quien hizo el
 * cambio). Se usa en cada acción que dispara un evento.
 */
export function kickNotifications(): void {
  after(async () => {
    try {
      await processNotificationQueue();
    } catch (error) {
      log.error("falló el envío de notificaciones", { error });
    }
  });
}

// ---------------------------------------------------------------------------
// Procesos programados
// ---------------------------------------------------------------------------
/** Reserva un proceso si no corrió en los últimos `minutes` (varias instancias no lo repiten). */
export async function claimJob(name: string, minutes: number): Promise<boolean> {
  const rows = await withActor(serviceActor, (tx) => tx`
    insert into public.job_runs (name, last_run_at) values (${name}, now())
    on conflict (name) do update set last_run_at = now()
     where public.job_runs.last_run_at < now() - make_interval(mins => ${minutes})
    returning name`);
  return rows.length > 0;
}

/**
 * SLA vencido al equipo (§12): solicitud sin primera respuesta en
 * `first_response_sla_hours` hábiles, o sin cotizar en `quote_sla_hours`
 * hábiles desde que quedó completa. Un aviso por solicitud y etapa.
 */
export async function checkSlaOverdue(now: Date = new Date()): Promise<number> {
  const t = serverT("notify");
  const { settings, rows } = await withActor(serviceActor, async (tx) => {
    const settings = await tx<{ key: string; value: unknown }[]>`
      select key, value from public.settings where key in ('business_hours', 'first_response_sla_hours', 'quote_sla_hours')`;
    const rows = await tx<{ id: string; status: string; submitted_at: Date; in_review_at: Date | null }[]>`
      select id, status, submitted_at, in_review_at from public.quote_requests where status in ('submitted', 'in_review', 'rfq_sent')`;
    return { settings, rows };
  });
  const get = (key: string) => settings.find((s) => s.key === key)?.value;
  const hours = parseBusinessHours(get("business_hours"));
  const firstSla = Number(get("first_response_sla_hours") ?? 4);
  const quoteSla = Number(get("quote_sla_hours") ?? 24);
  let queued = 0;
  for (const r of rows) {
    const first = r.status === "submitted";
    const start = first ? r.submitted_at : (r.in_review_at ?? r.submitted_at);
    const elapsed = businessHoursBetween(start, now, hours);
    const limit = first ? firstSla : quoteSla;
    if (elapsed < limit) continue;
    queued += await enqueueNotification("sla_overdue", r.id, {
      entityType: "quote_request",
      entityId: r.id,
      vars: { horas: Math.floor(elapsed), tarea: first ? t("taskRespond") : t("taskQuote") },
      dedupe: `sla:${first ? "first" : "quote"}:${r.id}:${start.toISOString()}`,
    });
  }
  return queued;
}

/**
 * Procesos que corren "cuando toca": la cola en cada llamada y el SLA cada 10
 * minutos como máximo. Los llama el cron diario y, para no depender de un plan
 * pago de crons, también el uso del panel (D-054).
 */
export async function runDueJobs(): Promise<void> {
  if (await claimJob("sla", 10)) await checkSlaOverdue();
  await processNotificationQueue();
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------
export type RequestNotification = {
  id: string;
  event: string;
  templateCode: string;
  audience: "client" | "team";
  channel: Channel;
  recipient: string;
  status: NotificationStatus;
  subject: string | null;
  body: string | null;
  waLink: string | null;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
  manualSentAt: Date | null;
};

export async function listRequestNotifications(user: CurrentUser, requestId: string): Promise<RequestNotification[]> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return [];
  const rows = await withActor(actorFor(user), (tx) => tx<
    {
      id: string;
      event: string;
      template_code: string;
      audience: "client" | "team";
      channel: Channel;
      recipient: string;
      status: NotificationStatus;
      subject: string | null;
      body: string | null;
      wa_link: string | null;
      error: string | null;
      created_at: Date;
      sent_at: Date | null;
      manual_sent_at: Date | null;
    }[]
  >`
    select id, event, template_code, audience, channel, recipient, status, subject, body, wa_link, error, created_at, sent_at, manual_sent_at
      from public.notifications where request_id = ${requestId} order by created_at desc, channel`);
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    templateCode: r.template_code,
    audience: r.audience,
    channel: r.channel,
    recipient: r.recipient,
    status: r.status,
    subject: r.subject,
    body: r.body,
    waLink: r.wa_link,
    error: r.error,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    manualSentAt: r.manual_sent_at,
  }));
}

/** El equipo abrió el WhatsApp precargado y confirma que lo envió. */
export async function markWhatsappSent(user: CurrentUser, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return withActor(actorFor(user), async (tx) => {
    const rows = await tx<{ request_id: string | null }[]>`
      update public.notifications set status = 'sent', manual_sent_by = ${user.userId}, manual_sent_at = now(), updated_at = now()
       where id = ${id} and channel = 'whatsapp' and status = 'simulated'
       returning request_id`;
    const row = rows[0];
    if (!row) return false;
    if (row.request_id) {
      await tx`
        insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
        values (${row.request_id}, 'notification', ${id}, ${user.userId}, 'whatsapp', 'notification_manual_sent', 'whatsapp')`;
    }
    return true;
  });
}
