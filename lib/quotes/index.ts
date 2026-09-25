import "server-only";
import { actorFor, EDITOR_ROLES, type CurrentUser } from "@/lib/auth";
import { getPublicCatalog, publicSetting, quoteConditions } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { leadTimeDaysFor, todayInPanama } from "@/lib/leadtime";
import { enqueueNotification } from "@/lib/notify";
import { expiryReminderDue } from "@/lib/notify/schedule";
import { onQuoteAccepted } from "@/lib/orders/hooks";
import { getRequestDetail } from "@/lib/panel/requests";
import { getRequestByToken } from "@/lib/quote/tracking";
import { getObject, putObject, signedUrl } from "@/lib/storage";
import { absoluteUrl } from "@/lib/urls";
import { renderQuotePdf } from "./pdf";
import { parseMoney, priceLine } from "./pricing";

/**
 * Cotizaciones (PRD §11 y §14): borrador con precio por línea (costo de
 * fábrica + flete + margen), emisión con PDF y aviso al cliente, versiones
 * (C-AAAA-NNNNN-vN), aceptación en un clic desde el enlace y vencimiento.
 */
const UUID = /^[0-9a-f-]{36}$/i;

export type QuoteStatus = "draft" | "sent" | "changes_requested" | "accepted" | "rejected" | "expired" | "superseded";

export type QuoteLine = {
  itemId: string;
  position: number;
  quantity: number;
  unitCost: number;
  freightTotal: number;
  marginPct: number;
  unitPrice: number;
  subtotal: number;
  leadTimeDays: number;
};

export type Quote = {
  id: string;
  requestId: string;
  rfqId: string | null;
  number: string;
  version: number;
  status: QuoteStatus;
  lines: QuoteLine[];
  currency: string;
  depositPct: number;
  validUntil: string;
  notes: string | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  acceptedByName: string | null;
  acceptedSelection: { itemId: string; quantity: number }[] | null;
  changesRequestedAt: Date | null;
  hasPdf: boolean;
};

export type QuoteResult<T = object> = ({ ok: true } & T) | { ok: false; error: "forbidden" | "not_found" | "status" | "no_rfq" | "lines" | "valid_until" | "selection" | "expired" | "name" | "body" };

type DbLine = { item_id: string; position: number; quantity: number; unit_cost: number; freight_total: number; margin_pct: number; unit_price: number; subtotal: number; lead_time_days: number };
type DbQuote = {
  id: string;
  request_id: string;
  rfq_id: string | null;
  number: string;
  version: number;
  status: QuoteStatus;
  lines: DbLine[];
  currency: string;
  deposit_pct: number;
  valid_until: string;
  notes: string | null;
  pdf_path: string | null;
  sent_at: Date | null;
  accepted_at: Date | null;
  accepted_by_name: string | null;
  accepted_selection: { item_id: string; quantity: number }[] | null;
  changes_requested_at: Date | null;
};

const toQuote = (q: DbQuote): Quote => ({
  id: q.id,
  requestId: q.request_id,
  rfqId: q.rfq_id,
  number: q.number,
  version: q.version,
  status: q.status,
  lines: (q.lines ?? []).map((l) => ({
    itemId: l.item_id,
    position: l.position,
    quantity: Number(l.quantity),
    unitCost: Number(l.unit_cost),
    freightTotal: Number(l.freight_total),
    marginPct: Number(l.margin_pct),
    unitPrice: Number(l.unit_price),
    subtotal: Number(l.subtotal),
    leadTimeDays: Number(l.lead_time_days),
  })),
  currency: q.currency,
  depositPct: q.deposit_pct,
  validUntil: q.valid_until,
  notes: q.notes,
  sentAt: q.sent_at,
  acceptedAt: q.accepted_at,
  acceptedByName: q.accepted_by_name,
  acceptedSelection: q.accepted_selection?.map((s) => ({ itemId: s.item_id, quantity: Number(s.quantity) })) ?? null,
  changesRequestedAt: q.changes_requested_at,
  hasPdf: Boolean(q.pdf_path),
});

const SELECT = (tx: Tx) => tx`
  select id, request_id, rfq_id, number, version, status, lines, currency, deposit_pct, to_char(valid_until, 'YYYY-MM-DD') as valid_until, notes, pdf_path,
         sent_at, accepted_at, accepted_by_name, accepted_selection, changes_requested_at
    from public.quotes`;

function isEditor(user: CurrentUser): boolean {
  return user.isActive && EDITOR_ROLES.includes(user.role);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "30" o "30 a 45": el plazo que va en el aviso al cliente. */
export function leadTimeLabel(lines: readonly { leadTimeDays: number }[]): string {
  const days = [...new Set(lines.map((l) => l.leadTimeDays))].sort((a, b) => a - b);
  if (days.length === 0) return "";
  return days.length === 1 ? String(days[0]) : `${days[0]} a ${days[days.length - 1]}`;
}

export async function listQuotes(user: CurrentUser, requestId: string): Promise<Quote[]> {
  if (!UUID.test(requestId)) return [];
  const rows = await withActor(actorFor(user), (tx) => tx<DbQuote[]>`${SELECT(tx)} where request_id = ${requestId} order by version desc`);
  return rows.map(toQuote);
}

async function loadQuote(tx: Tx, id: string): Promise<DbQuote | null> {
  if (!UUID.test(id)) return null;
  const rows = await tx<DbQuote[]>`${SELECT(tx)} where id = ${id}`;
  return rows[0] ?? null;
}

/**
 * Borrador de cotización: desde la última respuesta de fábrica (o copiando la
 * versión anterior). Margen por defecto `default_margin_pct`, flete en 0 y
 * plazo según la cantidad (30/45 días de settings).
 */
export async function createQuoteDraft(user: CurrentUser, requestId: string): Promise<QuoteResult<{ quote: Quote }>> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  const request = await getRequestDetail(user, requestId);
  if (!request) return { ok: false, error: "not_found" };
  if (!["rfq_sent", "quoted", "expired"].includes(request.status)) return { ok: false, error: "status" };
  const catalog = await getPublicCatalog();
  const { leadTime, depositPct } = quoteConditions(catalog);
  const settings = await withActor(serviceActor, (tx) => tx<{ key: string; value: unknown }[]>`
    select key, value from public.settings where key in ('default_margin_pct', 'quote_validity_days')`);
  const margin = Number(settings.find((s) => s.key === "default_margin_pct")?.value ?? 35);
  const validity = Number(settings.find((s) => s.key === "quote_validity_days")?.value ?? publicSetting(catalog, "quote_validity_days", 15));

  return withActor(actorFor(user), async (tx) => {
    const existing = await tx<DbQuote[]>`${SELECT(tx)} where request_id = ${requestId} order by version desc`;
    const draft = existing.find((q) => q.status === "draft");
    if (draft) return { ok: true, quote: toQuote(draft) } as const;
    const previous = existing[0];
    const [rfq] = await tx<{ id: string; costs: { item_id: string; quantity: number; unit_cost: number }[] }[]>`
      select id, costs from public.factory_rfqs where request_id = ${requestId} and responded_at is not null order by version desc limit 1`;
    if (!previous && !rfq) return { ok: false, error: "no_rfq" } as const;

    const lines: DbLine[] = request.items.flatMap((item) =>
      item.spec.quantities.map((quantity) => {
        const prev = previous?.lines.find((l) => l.item_id === item.id && Number(l.quantity) === quantity);
        const cost = rfq?.costs.find((c) => c.item_id === item.id && Number(c.quantity) === quantity);
        const unitCost = Number(cost?.unit_cost ?? prev?.unit_cost ?? 0);
        const freight = Number(prev?.freight_total ?? 0);
        const marginPct = Number(prev?.margin_pct ?? margin);
        const price = priceLine({ quantity, unitCost, freightTotal: freight, marginPct });
        return {
          item_id: item.id,
          position: item.position,
          quantity,
          unit_cost: unitCost,
          freight_total: freight,
          margin_pct: marginPct,
          unit_price: price?.unitPrice ?? 0,
          subtotal: price?.subtotal ?? 0,
          lead_time_days: Number(prev?.lead_time_days ?? leadTimeDaysFor(quantity, leadTime)),
        };
      }),
    );
    let base = previous ? previous.number.replace(/-v\d+$/, "") : null;
    if (!base) {
      const [row] = await withActor(serviceActor, (s) => s<{ n: string }[]>`select public.next_document_number('C') as n`);
      base = row?.n ?? null;
    }
    if (!base) throw new Error("no se pudo numerar la cotización");
    const version = (previous?.version ?? 0) + 1;
    const [created] = await tx<DbQuote[]>`
      insert into public.quotes (request_id, rfq_id, base_number, version, number, lines, deposit_pct, valid_until, notes)
      values (${requestId}, ${rfq?.id ?? previous?.rfq_id ?? null}, ${base}, ${version}, ${`${base}-v${version}`}, ${tx.json(lines as never)},
              ${depositPct}, ${addDaysIso(todayInPanama(), validity)}, ${previous?.notes ?? null})
      returning id`;
    const quote = await loadQuote(tx, created!.id);
    return { ok: true, quote: toQuote(quote!) } as const;
  });
}

export type QuoteDraftInput = {
  lines: { itemId: string; quantity: number; unitCost: string; freightTotal: string; marginPct: string; leadTimeDays: string }[];
  validUntil: string;
  notes: string;
};

/** Guarda el borrador: el precio se recalcula siempre en el servidor. */
export async function updateQuoteDraft(user: CurrentUser, quoteId: string, input: QuoteDraftInput): Promise<QuoteResult<{ quote: Quote }>> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil) || input.validUntil < todayInPanama()) return { ok: false, error: "valid_until" };
  return withActor(actorFor(user), async (tx) => {
    const quote = await loadQuote(tx, quoteId);
    if (!quote) return { ok: false, error: "not_found" } as const;
    if (quote.status !== "draft") return { ok: false, error: "status" } as const;
    const lines: DbLine[] = [];
    for (const current of quote.lines) {
      const edit = input.lines.find((l) => l.itemId === current.item_id && Number(l.quantity) === Number(current.quantity));
      const unitCost = parseMoney(edit?.unitCost ?? String(current.unit_cost));
      const freight = parseMoney(edit?.freightTotal ?? String(current.freight_total));
      const margin = parseMoney(edit?.marginPct ?? String(current.margin_pct));
      const days = Number(edit?.leadTimeDays ?? current.lead_time_days);
      if (unitCost === null || freight === null || margin === null || !Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: "lines" } as const;
      const price = priceLine({ quantity: Number(current.quantity), unitCost, freightTotal: freight, marginPct: margin });
      if (!price) return { ok: false, error: "lines" } as const;
      lines.push({ ...current, unit_cost: unitCost, freight_total: freight, margin_pct: margin, unit_price: price.unitPrice, subtotal: price.subtotal, lead_time_days: days });
    }
    await tx`update public.quotes set lines = ${tx.json(lines as never)}, valid_until = ${input.validUntil}, notes = ${input.notes.trim().slice(0, 4000) || null} where id = ${quoteId}`;
    return { ok: true, quote: toQuote((await loadQuote(tx, quoteId))!) } as const;
  });
}

/**
 * Emite la cotización: PDF con marca, versión anterior reemplazada, solicitud
 * en "Cotizada" y aviso al cliente por correo y WhatsApp.
 */
export async function issueQuote(user: CurrentUser, quoteId: string): Promise<QuoteResult<{ quote: Quote }>> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  const quote = await withActor(actorFor(user), (tx) => loadQuote(tx, quoteId));
  if (!quote) return { ok: false, error: "not_found" };
  if (quote.status !== "draft") return { ok: false, error: "status" };
  if (quote.valid_until < todayInPanama()) return { ok: false, error: "valid_until" };
  if (!quote.lines.length || quote.lines.some((l) => !priceLine({ quantity: Number(l.quantity), unitCost: Number(l.unit_cost), freightTotal: Number(l.freight_total), marginPct: Number(l.margin_pct) }))) {
    return { ok: false, error: "lines" };
  }
  const request = await getRequestDetail(user, quote.request_id);
  if (!request) return { ok: false, error: "not_found" };
  if (!["rfq_sent", "quoted", "expired"].includes(request.status)) return { ok: false, error: "status" };
  const [token] = await withActor(serviceActor, (tx) => tx<{ access_token: string }[]>`select access_token from public.quote_requests where id = ${quote.request_id}`);
  const q = toQuote(quote);
  const pdfBuffer = await renderQuotePdf({
    number: q.number,
    requestNumber: request.number,
    issuedAt: new Date(),
    validUntil: q.validUntil,
    currency: q.currency,
    depositPct: q.depositPct,
    client: { company: request.companyName, contact: request.contactName, email: request.contactEmail, whatsapp: request.contactWhatsapp, city: request.deliveryCity, address: request.deliveryAddress },
    items: request.items.map((item) => ({
      position: item.position,
      spec: item.spec,
      lines: q.lines.filter((l) => l.itemId === item.id).map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, subtotal: l.subtotal, leadTimeDays: l.leadTimeDays })),
    })),
    notes: q.notes,
    trackingLink: absoluteUrl(`/seguimiento/${token?.access_token ?? ""}`),
  });
  const path = `requests/${quote.request_id}/quotes/${q.number}.pdf`;
  await putObject("documents", path, pdfBuffer, "application/pdf");
  await withActor(actorFor(user), async (tx) => {
    await tx`update public.quotes set status = 'superseded' where request_id = ${quote.request_id} and id <> ${quote.id} and status in ('sent', 'changes_requested')`;
    await tx`update public.quotes set status = 'sent', sent_at = now(), pdf_path = ${path} where id = ${quote.id}`;
    const [req] = await tx<{ status: string }[]>`select status from public.quote_requests where id = ${quote.request_id} for update`;
    if (req && req.status !== "quoted") {
      await tx`select set_config('app.transition_reason', ${q.number}, true)`;
      await tx`update public.quote_requests set status = 'quoted' where id = ${quote.request_id}`;
    }
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${quote.request_id}, 'quote', ${quote.id}, ${user.userId}, 'system', 'quote_sent', ${q.number})`;
  });
  await enqueueNotification("quote_sent", quote.request_id, {
    entityType: "quote",
    entityId: quote.id,
    vars: { numero_cotizacion: q.number, fecha: formatDate(q.validUntil + "T17:00:00Z"), anticipo: q.depositPct, saldo: 100 - q.depositPct, plazo: leadTimeLabel(q.lines) },
    dedupe: `quote_sent:${quote.id}`,
  });
  return { ok: true, quote: { ...q, status: "sent", hasPdf: true } };
}

/** URL firmada del PDF de una cotización (equipo). */
export async function quoteFileUrl(user: CurrentUser, quoteId: string): Promise<string | null> {
  const quote = await withActor(actorFor(user), (tx) => loadQuote(tx, quoteId));
  if (!quote?.pdf_path) return null;
  return signedUrl("documents", quote.pdf_path, { expiresIn: 300 });
}

// ---------------------------------------------------------------------------
// Cliente (enlace seguro): sin precios en pantalla; los precios van en el PDF.
// ---------------------------------------------------------------------------
export type ClientQuote = {
  id: string;
  number: string;
  status: QuoteStatus;
  validUntil: string;
  sentAt: Date | null;
  acceptedAt: Date | null;
  acceptedByName: string | null;
  acceptedSelection: { itemId: string; quantity: number }[] | null;
  /** Cantidades cotizadas por pieza (para elegir al aceptar). */
  options: { itemId: string; position: number; label: string; quantities: number[] }[];
};

export async function getClientQuote(accessToken: string): Promise<ClientQuote | null> {
  const request = await getRequestByToken(accessToken);
  if (!request) return null;
  const rows = await withActor(serviceActor, (tx) => tx<DbQuote[]>`
    ${SELECT(tx)} where request_id = ${request.id} and status not in ('draft', 'superseded') order by version desc limit 1`);
  const q = rows[0];
  if (!q) return null;
  const quote = toQuote(q);
  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    validUntil: quote.validUntil,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    acceptedByName: quote.acceptedByName,
    acceptedSelection: quote.acceptedSelection,
    options: request.items.map((item) => ({
      itemId: item.id,
      position: item.position,
      label: item.spec.type?.name ?? "",
      quantities: quote.lines.filter((l) => l.itemId === item.id).map((l) => l.quantity),
    })),
  };
}

/** Ruta del PDF para el cliente (solo su cotización, emitida). */
export async function clientQuotePdf(accessToken: string, quoteId: string): Promise<{ data: Buffer; name: string } | null> {
  const request = await getRequestByToken(accessToken);
  if (!request || !UUID.test(quoteId)) return null;
  const [q] = await withActor(serviceActor, (tx) => tx<{ number: string; pdf_path: string | null }[]>`
    select number, pdf_path from public.quotes where id = ${quoteId} and request_id = ${request.id} and status <> 'draft'`);
  if (!q?.pdf_path) return null;
  const file = await getObject("documents", q.pdf_path);
  return file ? { data: file.data, name: `${q.number}.pdf` } : null;
}

/**
 * Aceptación en un clic (§11): el cliente elige una cantidad por pieza y
 * queda registrada con fecha, nombre, IP y navegador (inmutable). La
 * solicitud pasa a Aceptada y se crea el pedido (gancho de E8).
 */
export async function acceptQuote(
  accessToken: string,
  quoteId: string,
  input: { name: string; selection: { itemId: string; quantity: number }[]; ip: string | null; userAgent: string | null },
): Promise<QuoteResult> {
  const name = input.name.trim().slice(0, 160);
  if (name.length < 3) return { ok: false, error: "name" };
  const request = await getRequestByToken(accessToken);
  if (!request || !UUID.test(quoteId)) return { ok: false, error: "not_found" };
  return withActor(serviceActor, async (tx) => {
    const [q] = await tx<DbQuote[]>`${SELECT(tx)} where id = ${quoteId} and request_id = ${request.id} for update`;
    if (!q) return { ok: false, error: "not_found" } as const;
    if (q.status !== "sent") return { ok: false, error: "status" } as const;
    if (q.valid_until < todayInPanama()) return { ok: false, error: "expired" } as const;
    const items = [...new Set(q.lines.map((l) => l.item_id))];
    const selection = items.map((itemId) => input.selection.find((s) => s.itemId === itemId));
    const valid = selection.every((s) => s && q.lines.some((l) => l.item_id === s.itemId && Number(l.quantity) === Number(s.quantity)));
    if (!valid || input.selection.length !== items.length) return { ok: false, error: "selection" } as const;
    await tx`
      update public.quotes
         set status = 'accepted', accepted_at = now(), accepted_by_name = ${name}, accepted_by_email = ${request.contactEmail},
             accepted_ip = ${input.ip}, accepted_user_agent = ${input.userAgent?.slice(0, 300) ?? null},
             accepted_selection = ${tx.json(selection.map((s) => ({ item_id: s!.itemId, quantity: Number(s!.quantity) })))}
       where id = ${q.id}`;
    await tx`select set_config('app.transition_reason', ${`${q.number} · ${name}`}, true)`;
    await tx`update public.quote_requests set status = 'accepted' where id = ${request.id}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, channel, kind, body, payload)
      values (${request.id}, 'quote', ${q.id}, 'system', 'quote_accepted', ${name}, ${tx.json({ ip: input.ip, number: q.number })})`;
    await onQuoteAccepted(tx, q.id);
    return { ok: true } as const;
  });
}

/** "Pedir cambios": texto libre que queda en la solicitud y avisa al equipo. */
export async function requestQuoteChanges(accessToken: string, quoteId: string, text: string): Promise<QuoteResult> {
  const body = text.trim().slice(0, 4000);
  if (body.length < 3) return { ok: false, error: "body" };
  const request = await getRequestByToken(accessToken);
  if (!request || !UUID.test(quoteId)) return { ok: false, error: "not_found" };
  const number = await withActor(serviceActor, async (tx) => {
    const [q] = await tx<{ id: string; number: string; status: QuoteStatus }[]>`
      select id, number, status from public.quotes where id = ${quoteId} and request_id = ${request.id} for update`;
    if (!q || q.status !== "sent") return null;
    await tx`update public.quotes set status = 'changes_requested', changes_requested_at = now() where id = ${q.id}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, channel, kind, body)
      values (${request.id}, 'quote', ${q.id}, 'system', 'quote_changes', ${body})`;
    return q.number;
  });
  if (!number) return { ok: false, error: "status" };
  await enqueueNotification("quote_changes", request.id, {
    entityType: "quote",
    entityId: quoteId,
    vars: { numero_cotizacion: number, respuesta: body.length > 300 ? `${body.slice(0, 299)}…` : body },
    dedupe: `quote_changes:${quoteId}`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Procesos programados
// ---------------------------------------------------------------------------
/** Vence las cotizaciones pasadas de vigencia (la solicitud pasa a Vencida). */
export async function expireQuotes(now: Date = new Date()): Promise<number> {
  const today = todayInPanama(now);
  return withActor(serviceActor, async (tx) => {
    const due = await tx<{ id: string; request_id: string; number: string }[]>`
      select q.id, q.request_id, q.number from public.quotes q join public.quote_requests r on r.id = q.request_id
       where q.status in ('sent', 'changes_requested') and q.valid_until < ${today}::date and r.status = 'quoted'`;
    for (const q of due) {
      await tx`select set_config('app.transition_reason', ${q.number}, true)`;
      await tx`update public.quote_requests set status = 'expired' where id = ${q.request_id} and status = 'quoted'`;
    }
    return due.length;
  });
}

/** Recordatorio de vigencia al cliente a 3 y 1 día (§12). */
export async function quoteExpiryReminders(now: Date = new Date()): Promise<number> {
  const quotes = await withActor(serviceActor, (tx) => tx<{ id: string; request_id: string; number: string; valid_until: string }[]>`
    select id, request_id, number, to_char(valid_until, 'YYYY-MM-DD') as valid_until from public.quotes where status = 'sent'`);
  let queued = 0;
  for (const q of quotes) {
    const due = expiryReminderDue(new Date(`${q.valid_until}T17:00:00Z`), now);
    if (due === null) continue;
    queued += await enqueueNotification("quote_expiring", q.request_id, {
      entityType: "quote",
      entityId: q.id,
      vars: { numero_cotizacion: q.number, fecha: formatDate(`${q.valid_until}T17:00:00Z`) },
      dedupe: `quote_expiring:${q.id}:${due}`,
    });
  }
  return queued;
}
