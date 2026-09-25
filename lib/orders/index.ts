import "server-only";
import { actorFor, EDITOR_ROLES, type CurrentUser } from "@/lib/auth";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { detectFileKind, type DetectedKind } from "@/lib/files/magic";
import { formatDate } from "@/lib/format";
import { serverT } from "@/lib/i18n";
import { addDays, leadTimeStart, todayInPanama } from "@/lib/leadtime";
import { enqueueNotification } from "@/lib/notify";
import { balanceReminderDue, npsDue } from "@/lib/notify/schedule";
import type { ItemSpec } from "@/lib/quote/spec";
import { getRequestByToken } from "@/lib/quote/tracking";
import { formatMoney, parseMoney } from "@/lib/quotes/pricing";
import { readObjectHead, removeObject, signedUploadUrl, signedUrl } from "@/lib/storage";
import { fileNonce } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/urls";
import { mergeQaResults, qaChecklistFromSpec, qaComplete, type QaKey, type QaPoint } from "./qa";
import type { ReorderSource } from "./reorder";

/**
 * Pedidos (PRD §6, §10, §11, §14): se crean al aceptar la cotización, avanzan
 * por hitos con evidencias y checklist de QA, registran anticipo y saldo, y el
 * cliente los sigue desde su enlace, con los montos de su cotización aceptada (D-101).
 */
const UUID = /^[0-9a-f-]{36}$/i;

export type OrderStatus = "pending_deposit" | "deposit_received" | "in_production" | "qa" | "shipped" | "in_customs" | "delivered" | "closed";
export type MilestoneType = "deposit_received" | "artwork_approved" | "production_started" | "qa_completed" | "shipped" | "in_customs" | "delivered" | "balance_received" | "closed";
export type PaymentKind = "deposit" | "balance";
export type PaymentStatus = "pending" | "confirmed" | "rejected";
export type Evidence = { path: string; kind: DetectedKind; name: string; size: number };

export type Milestone = { id: string; type: MilestoneType; occurredAt: Date; responsible: string | null; notes: string | null; evidence: Evidence[]; qaChecklist: QaPoint[] | null };
export type Payment = {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number | null;
  currency: string;
  method: string | null;
  reference: string | null;
  hasReceipt: boolean;
  paidOn: string | null;
  uploadedByClient: boolean;
  confirmedAt: Date | null;
  notes: string | null;
  createdAt: Date;
};

export type OrderDetail = {
  id: string;
  number: string;
  status: OrderStatus;
  requestId: string;
  requestNumber: string;
  quoteNumber: string;
  company: string;
  currency: string;
  total: number;
  depositPct: number;
  depositAmount: number;
  balanceAmount: number;
  leadTimeDays: number;
  leadTimeStart: string | null;
  estimatedDeliveryDate: string | null;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  transport: string | null;
  tracking: string | null;
  eta: string | null;
  notes: string | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
  delayed: boolean;
  depositConfirmed: boolean;
  balanceConfirmed: boolean;
  artworkReady: boolean;
  items: { id: string; position: number; spec: ItemSpec; quantity: number; unitPrice: number; subtotal: number }[];
  milestones: Milestone[];
  payments: Payment[];
};

export type OrderResult<T = object> = ({ ok: true } & T) | { ok: false; error: "forbidden" | "not_found" | "status" | "artwork" | "qa" | "amount" | "balance" | "type" | "file" | "score" };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function isEditor(user: CurrentUser): boolean {
  return user.isActive && EDITOR_ROLES.includes(user.role);
}

// ---------------------------------------------------------------------------
// Creación (gancho de la aceptación) y calendario
// ---------------------------------------------------------------------------
/** Arte listo para producir: todas las piezas impresas con proof aprobado por el cliente. */
async function artworkStatus(tx: Tx, requestId: string): Promise<{ ready: boolean; approvedAt: Date | null; printed: number }> {
  const items = await tx<{ id: string; spec_snapshot: ItemSpec }[]>`select id, spec_snapshot from public.quote_items where request_id = ${requestId}`;
  const printed = items.filter((i) => i.spec_snapshot?.artwork && i.spec_snapshot.artwork !== "not_applicable" && !i.spec_snapshot.needsAdvice);
  if (printed.length === 0) return { ready: true, approvedAt: null, printed: 0 };
  const approvals = await tx<{ item_id: string; approved: Date | null }[]>`
    select item_id, max(client_approved_at) as approved from public.artwork_files
     where request_id = ${requestId} and kind = 'proof' and client_approved_at is not null and deleted_at is null
     group by item_id`;
  const dates = printed.map((i) => approvals.find((a) => a.item_id === i.id)?.approved ?? null);
  if (dates.some((d) => d === null)) return { ready: false, approvedAt: null, printed: printed.length };
  const approvedAt = new Date(Math.max(...dates.map((d) => (d as Date).getTime())));
  return { ready: true, approvedAt, printed: printed.length };
}

/** Hito "Arte aprobado" cuando el cliente aprobó el proof de todas las piezas impresas. */
async function syncArtworkMilestone(tx: Tx, orderId: string, requestId: string): Promise<void> {
  const art = await artworkStatus(tx, requestId);
  if (!art.ready || !art.approvedAt) return;
  await tx`
    insert into public.milestones (order_id, type, occurred_at)
    select ${orderId}, 'artwork_approved', ${art.approvedAt}
     where not exists (select 1 from public.milestones where order_id = ${orderId} and type = 'artwork_approved')`;
}

/**
 * Fecha estimada de entrega (§14): el plazo corre desde el último de anticipo
 * confirmado y proof aprobado (sin impresión, desde el anticipo).
 */
async function recomputeSchedule(tx: Tx, orderId: string): Promise<void> {
  const [o] = await tx<{ request_id: string; lead_time_days: number }[]>`select request_id, lead_time_days from public.orders where id = ${orderId}`;
  if (!o) return;
  const [dep] = await tx<{ at: Date | null }[]>`
    select min(confirmed_at) as at from public.payments where order_id = ${orderId} and kind = 'deposit' and status = 'confirmed'`;
  const art = await artworkStatus(tx, o.request_id);
  const depositAt = dep?.at ?? null;
  const start = leadTimeStart(depositAt, art.printed === 0 ? depositAt : art.approvedAt);
  const startIso = start ? todayInPanama(start) : null;
  const estimated = startIso ? addDays(new Date(`${startIso}T12:00:00Z`), o.lead_time_days).toISOString().slice(0, 10) : null;
  await tx`update public.orders set lead_time_start = ${startIso}, estimated_delivery_date = ${estimated} where id = ${orderId}`;
}

/**
 * Crea el pedido al aceptar la cotización (misma transacción): líneas y
 * total según las cantidades elegidas, anticipo y saldo según `deposit_pct`,
 * plazo = el mayor de las líneas elegidas.
 */
export async function createOrderFromQuote(tx: Tx, quoteId: string): Promise<string | null> {
  const [q] = await tx<
    {
      id: string;
      request_id: string;
      currency: string;
      deposit_pct: number;
      lines: { item_id: string; position: number; quantity: number; unit_price: number; subtotal: number; lead_time_days: number }[];
      accepted_selection: { item_id: string; quantity: number }[] | null;
    }[]
  >`select id, request_id, currency, deposit_pct, lines, accepted_selection from public.quotes where id = ${quoteId} and status = 'accepted'`;
  if (!q?.accepted_selection) return null;
  const existing = await tx<{ id: string }[]>`select id from public.orders where quote_id = ${quoteId}`;
  if (existing[0]) return existing[0].id;
  const lines = q.accepted_selection.flatMap((s) => {
    const l = q.lines.find((x) => x.item_id === s.item_id && Number(x.quantity) === Number(s.quantity));
    return l ? [{ item_id: l.item_id, position: l.position, quantity: Number(l.quantity), unit_price: Number(l.unit_price), subtotal: Number(l.subtotal), lead_time_days: Number(l.lead_time_days) }] : [];
  });
  const total = round2(lines.reduce((sum, l) => sum + l.subtotal, 0));
  const deposit = round2((total * q.deposit_pct) / 100);
  const [numbered] = await tx<{ n: string }[]>`select public.next_document_number('P') as n`;
  const [req] = await tx<{ delivery_address: string | null; delivery_city: string | null }[]>`
    select delivery_address, delivery_city from public.quote_requests where id = ${q.request_id}`;
  const [order] = await tx<{ id: string }[]>`
    insert into public.orders (number, quote_id, request_id, lines, currency, total_amount, deposit_pct, deposit_amount, balance_amount, lead_time_days, delivery_address, delivery_city)
    values (${numbered!.n}, ${q.id}, ${q.request_id}, ${tx.json(lines)}, ${q.currency}, ${total}, ${q.deposit_pct}, ${deposit}, ${round2(total - deposit)},
            ${Math.max(1, ...lines.map((l) => l.lead_time_days))}, ${req?.delivery_address ?? null}, ${req?.delivery_city ?? null})
    returning id`;
  await tx`
    insert into public.activities (request_id, entity_type, entity_id, channel, kind, body)
    values (${q.request_id}, 'order', ${order!.id}, 'system', 'order_created', ${numbered!.n})`;
  await syncArtworkMilestone(tx, order!.id, q.request_id);
  await recomputeSchedule(tx, order!.id);
  return order!.id;
}

/** Tras aprobar un proof: si ya hay pedido, actualiza el hito de arte y la fecha estimada. */
export async function onProofApproved(tx: Tx, requestId: string): Promise<void> {
  const orders = await tx<{ id: string }[]>`select id from public.orders where request_id = ${requestId}`;
  for (const o of orders) {
    await syncArtworkMilestone(tx, o.id, requestId);
    await recomputeSchedule(tx, o.id);
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------
type DbOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  request_id: string;
  request_number: string;
  quote_number: string;
  company: string;
  currency: string;
  total_amount: string;
  deposit_pct: number;
  deposit_amount: string;
  balance_amount: string;
  lead_time_days: number;
  lead_time_start: string | null;
  estimated_delivery_date: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  transport: string | null;
  tracking: string | null;
  eta: string | null;
  notes: string | null;
  delivered_at: Date | null;
  closed_at: Date | null;
  lines: { item_id: string; position: number; quantity: number; unit_price: number; subtotal: number }[];
};

const ORDER_SELECT = (tx: Tx) => tx`
  select o.id, o.number, o.status, o.request_id, r.number as request_number, q.number as quote_number, coalesce(r.company_name, r.contact_name) as company,
         o.currency, o.total_amount, o.deposit_pct, o.deposit_amount, o.balance_amount, o.lead_time_days,
         to_char(o.lead_time_start, 'YYYY-MM-DD') as lead_time_start, to_char(o.estimated_delivery_date, 'YYYY-MM-DD') as estimated_delivery_date,
         o.delivery_address, o.delivery_city, o.transport, o.tracking, to_char(o.eta, 'YYYY-MM-DD') as eta, o.notes, o.delivered_at, o.closed_at, o.lines
    from public.orders o
    join public.quote_requests r on r.id = o.request_id
    join public.quotes q on q.id = o.quote_id`;

function isDelayed(o: { status: OrderStatus; estimated_delivery_date: string | null; eta: string | null }, today = todayInPanama()): boolean {
  if (o.status === "delivered" || o.status === "closed") return false;
  const due = o.eta ?? o.estimated_delivery_date;
  return Boolean(due && due < today);
}

export type OrderSummary = {
  id: string;
  number: string;
  status: OrderStatus;
  requestId: string;
  requestNumber: string;
  company: string;
  estimatedDeliveryDate: string | null;
  eta: string | null;
  delayed: boolean;
  depositConfirmed: boolean;
  balanceConfirmed: boolean;
  pendingReceipts: number;
};

export async function listOrders(user: CurrentUser): Promise<OrderSummary[]> {
  return withActor(actorFor(user), async (tx) => {
    const rows = await tx<(DbOrder & { deposit_ok: boolean; balance_ok: boolean; pending: number })[]>`
      ${ORDER_SELECT(tx)},
      lateral (
        select bool_or(p.kind = 'deposit' and p.status = 'confirmed') as deposit_ok,
               bool_or(p.kind = 'balance' and p.status = 'confirmed') as balance_ok,
               count(*) filter (where p.status = 'pending')::int as pending
          from public.payments p where p.order_id = o.id
      ) pay
      order by (o.status in ('delivered', 'closed')), o.estimated_delivery_date nulls last, o.created_at desc`;
    return rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      requestId: o.request_id,
      requestNumber: o.request_number,
      company: o.company,
      estimatedDeliveryDate: o.estimated_delivery_date,
      eta: o.eta,
      delayed: isDelayed(o),
      depositConfirmed: Boolean(o.deposit_ok),
      balanceConfirmed: Boolean(o.balance_ok),
      pendingReceipts: o.pending ?? 0,
    }));
  });
}

async function loadDetail(tx: Tx, where: { id?: string; requestId?: string }): Promise<OrderDetail | null> {
  const [o] = await tx<DbOrder[]>`${ORDER_SELECT(tx)} where ${where.id ? tx`o.id = ${where.id}` : tx`o.request_id = ${where.requestId ?? null}`} order by o.created_at desc limit 1`;
  if (!o) return null;
  const items = await tx<{ id: string; position: number; spec_snapshot: ItemSpec }[]>`
    select id, position, spec_snapshot from public.quote_items where request_id = ${o.request_id} order by position`;
  const milestones = await tx<
    { id: string; type: MilestoneType; occurred_at: Date; responsible: string | null; notes: string | null; evidence: Evidence[]; qa_checklist: QaPoint[] | null }[]
  >`
    select m.id, m.type, m.occurred_at, coalesce(p.name, p.email) as responsible, m.notes, m.evidence, m.qa_checklist
      from public.milestones m left join public.profiles p on p.user_id = m.responsible
     where m.order_id = ${o.id} order by m.occurred_at, m.created_at`;
  const payments = await tx<
    {
      id: string;
      kind: PaymentKind;
      status: PaymentStatus;
      amount: string | null;
      currency: string;
      method: string | null;
      reference: string | null;
      receipt_path: string | null;
      paid_on: string | null;
      uploaded_by_client: boolean;
      confirmed_at: Date | null;
      notes: string | null;
      created_at: Date;
    }[]
  >`
    select id, kind, status, amount, currency, method, reference, receipt_path, to_char(paid_on, 'YYYY-MM-DD') as paid_on, uploaded_by_client, confirmed_at, notes, created_at
      from public.payments where order_id = ${o.id} order by created_at`;
  const art = await artworkStatus(tx, o.request_id);
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    requestId: o.request_id,
    requestNumber: o.request_number,
    quoteNumber: o.quote_number,
    company: o.company,
    currency: o.currency,
    total: Number(o.total_amount),
    depositPct: o.deposit_pct,
    depositAmount: Number(o.deposit_amount),
    balanceAmount: Number(o.balance_amount),
    leadTimeDays: o.lead_time_days,
    leadTimeStart: o.lead_time_start,
    estimatedDeliveryDate: o.estimated_delivery_date,
    deliveryAddress: o.delivery_address,
    deliveryCity: o.delivery_city,
    transport: o.transport,
    tracking: o.tracking,
    eta: o.eta,
    notes: o.notes,
    deliveredAt: o.delivered_at,
    closedAt: o.closed_at,
    delayed: isDelayed(o),
    depositConfirmed: payments.some((p) => p.kind === "deposit" && p.status === "confirmed"),
    balanceConfirmed: payments.some((p) => p.kind === "balance" && p.status === "confirmed"),
    artworkReady: art.ready,
    items: o.lines.map((l) => {
      const item = items.find((i) => i.id === l.item_id);
      return { id: l.item_id, position: l.position, spec: item?.spec_snapshot as ItemSpec, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), subtotal: Number(l.subtotal) };
    }),
    milestones: milestones.map((m) => ({
      id: m.id,
      type: m.type,
      occurredAt: m.occurred_at,
      responsible: m.responsible,
      notes: m.notes,
      evidence: m.evidence ?? [],
      qaChecklist: m.qa_checklist,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      amount: p.amount === null ? null : Number(p.amount),
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      hasReceipt: Boolean(p.receipt_path),
      paidOn: p.paid_on,
      uploadedByClient: p.uploaded_by_client,
      confirmedAt: p.confirmed_at,
      notes: p.notes,
      createdAt: p.created_at,
    })),
  };
}

export async function getOrder(user: CurrentUser, orderId: string): Promise<OrderDetail | null> {
  if (!UUID.test(orderId)) return null;
  return withActor(actorFor(user), (tx) => loadDetail(tx, { id: orderId }));
}

/** Detalle completo (con montos) para el PDF de estado de pagos del cliente, tras validar su enlace. */
export async function getOrderForToken(accessToken: string, orderId: string): Promise<OrderDetail | null> {
  if (!UUID.test(orderId)) return null;
  const request = await getRequestByToken(accessToken);
  if (!request) return null;
  const detail = await withActor(serviceActor, (tx) => loadDetail(tx, { id: orderId }));
  return detail?.requestId === request.id ? detail : null;
}

export async function getOrderRefForRequest(user: CurrentUser, requestId: string): Promise<{ id: string; number: string } | null> {
  if (!UUID.test(requestId)) return null;
  const rows = await withActor(actorFor(user), (tx) => tx<{ id: string; number: string }[]>`select id, number from public.orders where request_id = ${requestId} order by created_at desc limit 1`);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Hitos (manuales) y avance del estado
// ---------------------------------------------------------------------------
const MANUAL: Readonly<Record<OrderStatus, readonly MilestoneType[]>> = {
  pending_deposit: [],
  deposit_received: ["production_started"],
  in_production: ["qa_completed"],
  qa: ["shipped"],
  shipped: ["in_customs", "delivered"],
  in_customs: ["delivered"],
  delivered: ["closed"],
  closed: [],
};

const STATUS_AFTER: Partial<Record<MilestoneType, OrderStatus>> = {
  production_started: "in_production",
  qa_completed: "qa",
  shipped: "shipped",
  in_customs: "in_customs",
  delivered: "delivered",
  closed: "closed",
};

export function nextMilestones(status: OrderStatus): readonly MilestoneType[] {
  return MANUAL[status];
}

/** Checklist de QA del pedido a partir de la ficha aprobada. */
export function orderQaChecklist(order: Pick<OrderDetail, "items">): QaPoint[] {
  const ta = serverT("admin");
  const labels: Record<QaKey, string> = {
    material: ta("order.qa.material"),
    caliber: ta("order.qa.caliber"),
    size: ta("order.qa.size"),
    print: ta("order.qa.print"),
    finish: ta("order.qa.finish"),
    quantity: ta("order.qa.quantity"),
  };
  const ts = serverT("spec");
  return qaChecklistFromSpec(
    order.items.map((i) => ({ position: i.position, spec: i.spec, quantity: i.quantity })),
    labels,
    (key, values) => ts(key as "none", values as never),
  );
}

export type MilestoneInput = { type: string; occurredAt?: string; notes?: string; qa?: unknown; transport?: string; tracking?: string; eta?: string };

function dueLabel(o: { eta: string | null; estimated_delivery_date: string | null }): string {
  const date = o.eta ?? o.estimated_delivery_date;
  return date ? formatDate(`${date}T17:00:00Z`) : serverT("admin")("order.toBeConfirmed");
}

/**
 * Registra un hito: solo el siguiente paso válido. Producción exige anticipo
 * y proof aprobado (§14); QA exige el checklist completo; cerrar exige saldo.
 */
export async function recordMilestone(user: CurrentUser, orderId: string, input: MilestoneInput): Promise<OrderResult<{ milestoneId: string }>> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(orderId)) return { ok: false, error: "not_found" };
  const detail = await getOrder(user, orderId);
  if (!detail) return { ok: false, error: "not_found" };
  const type = input.type as MilestoneType;
  if (!nextMilestones(detail.status).includes(type)) return { ok: false, error: "type" };
  if (type === "production_started" && !detail.artworkReady) return { ok: false, error: "artwork" };
  if (type === "closed" && !detail.balanceConfirmed) return { ok: false, error: "balance" };
  let qa: QaPoint[] | null = null;
  if (type === "qa_completed") {
    qa = mergeQaResults(orderQaChecklist(detail), input.qa);
    if (!qaComplete(qa)) return { ok: false, error: "qa" };
  }
  // Hoy (o una fecha futura): la hora real; una fecha pasada queda al mediodía de Panamá.
  const past = input.occurredAt && /^\d{4}-\d{2}-\d{2}$/.test(input.occurredAt) && input.occurredAt < todayInPanama() ? input.occurredAt : null;
  const occurredAt = past ? new Date(`${past}T17:00:00Z`) : new Date();
  const eta = input.eta && /^\d{4}-\d{2}-\d{2}$/.test(input.eta) ? input.eta : null;
  const result = await withActor(actorFor(user), async (tx) => {
    const [m] = await tx<{ id: string }[]>`
      insert into public.milestones (order_id, type, occurred_at, responsible, notes, qa_checklist)
      values (${orderId}, ${type}, ${occurredAt}, ${user.userId}, ${input.notes?.trim().slice(0, 2000) || null}, ${qa ? tx.json(qa as never) : null})
      returning id`;
    const next = STATUS_AFTER[type];
    await tx`
      update public.orders
         set status = ${next ?? tx`status`},
             transport = ${type === "shipped" && input.transport?.trim() ? input.transport.trim().slice(0, 200) : tx`transport`},
             tracking = ${type === "shipped" && input.tracking?.trim() ? input.tracking.trim().slice(0, 200) : tx`tracking`},
             eta = ${type === "shipped" && eta ? eta : tx`eta`}
       where id = ${orderId}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${detail.requestId}, 'order', ${orderId}, ${user.userId}, 'system', 'milestone', ${type})`;
    const [o] = await tx<{ eta: string | null; estimated_delivery_date: string | null; balance_amount: string; currency: string; delivered_at: Date | null }[]>`
      select to_char(eta, 'YYYY-MM-DD') as eta, to_char(estimated_delivery_date, 'YYYY-MM-DD') as estimated_delivery_date, balance_amount, currency, delivered_at
        from public.orders where id = ${orderId}`;
    return { id: m!.id, order: o! };
  });
  // Aviso al cliente (§12): producción, QA, embarque y entrega. En QA, la
  // plantilla anuncia el embarque estimado (fecha opcional del formulario).
  const fecha = type === "qa_completed" ? (eta ? formatDate(`${eta}T17:00:00Z`) : serverT("admin")("order.toBeConfirmed")) : dueLabel(result.order);
  const vars = { numero_pedido: detail.number, fecha, hito: serverT("admin")(`order.milestoneTypes.${type}`) };
  const event =
    type === "production_started" ? "order_production" : type === "qa_completed" ? "order_milestone" : type === "shipped" ? "order_shipped" : type === "delivered" ? "order_delivered" : null;
  if (event) {
    await enqueueNotification(event, detail.requestId, {
      entityType: "milestone",
      entityId: result.id,
      vars:
        event === "order_delivered"
          ? { numero_pedido: detail.number, monto: formatMoney(Number(result.order.balance_amount), result.order.currency), fecha: formatDate(result.order.delivered_at ?? new Date()) }
          : vars,
      dedupe: `milestone:${result.id}`,
    });
  }
  return { ok: true, milestoneId: result.id };
}

/** Transporte, guía de rastreo, ETA y notas internas del pedido. */
export async function updateShipping(user: CurrentUser, orderId: string, input: { transport: string; tracking: string; eta: string; notes: string }): Promise<OrderResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(orderId)) return { ok: false, error: "not_found" };
  const eta = /^\d{4}-\d{2}-\d{2}$/.test(input.eta) ? input.eta : null;
  const rows = await withActor(actorFor(user), (tx) => tx`
    update public.orders
       set transport = ${input.transport.trim().slice(0, 200) || null}, tracking = ${input.tracking.trim().slice(0, 200) || null},
           eta = ${eta}, notes = ${input.notes.trim().slice(0, 4000) || null}
     where id = ${orderId} returning id`);
  return rows.length ? { ok: true } : { ok: false, error: "not_found" };
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------
async function afterPaymentConfirmed(tx: Tx, orderId: string, kind: PaymentKind, userId: string | null): Promise<{ notify: boolean }> {
  const [o] = await tx<{ status: OrderStatus; request_id: string }[]>`select status, request_id from public.orders where id = ${orderId} for update`;
  if (!o) return { notify: false };
  const type: MilestoneType = kind === "deposit" ? "deposit_received" : "balance_received";
  const inserted = await tx`
    insert into public.milestones (order_id, type, occurred_at, responsible)
    select ${orderId}, ${type}, now(), ${userId}
     where not exists (select 1 from public.milestones where order_id = ${orderId} and type = ${type})
    returning id`;
  if (kind === "deposit" && o.status === "pending_deposit") await tx`update public.orders set status = 'deposit_received' where id = ${orderId}`;
  await recomputeSchedule(tx, orderId);
  return { notify: kind === "deposit" && inserted.length > 0 };
}

async function notifyDeposit(orderId: string): Promise<void> {
  const [o] = await withActor(serviceActor, (tx) => tx<{ number: string; request_id: string; eta: string | null; estimated_delivery_date: string | null }[]>`
    select number, request_id, to_char(eta, 'YYYY-MM-DD') as eta, to_char(estimated_delivery_date, 'YYYY-MM-DD') as estimated_delivery_date from public.orders where id = ${orderId}`);
  if (!o) return;
  await enqueueNotification("deposit_received", o.request_id, {
    entityType: "order",
    entityId: orderId,
    vars: { numero_pedido: o.number, fecha: dueLabel(o) },
    dedupe: `deposit_received:${orderId}`,
  });
}

export type PaymentInput = { kind: string; amount: string; method: string; reference: string; paidOn: string; notes?: string };

/** El equipo registra un pago recibido (queda confirmado). */
export async function recordPayment(user: CurrentUser, orderId: string, input: PaymentInput): Promise<OrderResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(orderId)) return { ok: false, error: "not_found" };
  const kind = input.kind === "balance" ? "balance" : input.kind === "deposit" ? "deposit" : null;
  const amount = parseMoney(input.amount);
  if (!kind) return { ok: false, error: "type" };
  if (amount === null || amount <= 0) return { ok: false, error: "amount" };
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? input.paidOn : todayInPanama();
  const notify = await withActor(actorFor(user), async (tx) => {
    const [o] = await tx<{ id: string; request_id: string; currency: string }[]>`select id, request_id, currency from public.orders where id = ${orderId}`;
    if (!o) return null;
    const [p] = await tx<{ id: string }[]>`
      insert into public.payments (order_id, kind, status, amount, currency, method, reference, paid_on, confirmed_by, confirmed_at, notes)
      values (${orderId}, ${kind}, 'confirmed', ${amount}, ${o.currency}, ${input.method.trim().slice(0, 80) || null}, ${input.reference.trim().slice(0, 120) || null},
              ${paidOn}, ${user.userId}, now(), ${input.notes?.trim().slice(0, 1000) || null})
      returning id`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${o.request_id}, 'payment', ${p!.id}, ${user.userId}, 'system', 'payment_confirmed', ${kind})`;
    return (await afterPaymentConfirmed(tx, orderId, kind, user.userId)).notify;
  });
  if (notify === null) return { ok: false, error: "not_found" };
  if (notify) await notifyDeposit(orderId);
  return { ok: true };
}

/** Confirma (con monto) o rechaza un comprobante que subió el cliente. */
export async function reviewPayment(user: CurrentUser, paymentId: string, input: { decision: "confirm" | "reject"; amount?: string; method?: string; reference?: string; paidOn?: string; notes?: string }): Promise<OrderResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(paymentId)) return { ok: false, error: "not_found" };
  const amount = input.decision === "confirm" ? parseMoney(input.amount ?? "") : null;
  if (input.decision === "confirm" && (amount === null || amount <= 0)) return { ok: false, error: "amount" };
  const result = await withActor(actorFor(user), async (tx) => {
    const [p] = await tx<{ id: string; order_id: string; kind: PaymentKind; status: PaymentStatus }[]>`
      select id, order_id, kind, status from public.payments where id = ${paymentId} for update`;
    if (!p) return { error: "not_found" as const };
    if (p.status !== "pending") return { error: "status" as const };
    if (input.decision === "reject") {
      await tx`update public.payments set status = 'rejected', notes = ${input.notes?.trim().slice(0, 1000) || null} where id = ${p.id}`;
      return { orderId: p.order_id, notify: false };
    }
    await tx`
      update public.payments
         set status = 'confirmed', amount = ${amount}, method = ${input.method?.trim().slice(0, 80) || null}, reference = ${input.reference?.trim().slice(0, 120) || null},
             paid_on = ${input.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? input.paidOn : todayInPanama()}, confirmed_by = ${user.userId}, confirmed_at = now()
       where id = ${p.id}`;
    return { orderId: p.order_id, notify: (await afterPaymentConfirmed(tx, p.order_id, p.kind, user.userId)).notify };
  });
  if ("error" in result) return { ok: false, error: result.error ?? "not_found" };
  if (result.notify) await notifyDeposit(result.orderId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Archivos: evidencias de hitos (equipo) y comprobantes (cliente)
// ---------------------------------------------------------------------------
/** Evidencias por hito (fotos, video o PDF). */
export const MAX_EVIDENCE = 30;
/** Comprobantes del cliente pendientes de revisión, como máximo. */
const MAX_PENDING_RECEIPTS = 5;
const EVIDENCE_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp", "mp4", "mov", "pdf"];
const RECEIPT_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp", "pdf"];
const EVIDENCE_EXT = ["png", "jpg", "jpeg", "webp", "mp4", "mov", "pdf"];
const RECEIPT_EXT = ["png", "jpg", "jpeg", "webp", "pdf"];

function safeName(original: string): string {
  const base = original.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(-80);
  return base || "archivo";
}

export type UploadSlot = { ok: true; url: string; method: "PUT"; headers: Record<string, string>; path: string } | { ok: false; error: "tooLarge" | "tooMany" | "badType" | "expired" | "generic" };
export type UploadConfirm = { ok: true; file: { id: string; name: string; size: number; path: string; kind: string } } | { ok: false; error: "typeMismatch" | "tooLarge" | "expired" | "network" | "generic" };

async function maxBytes(): Promise<number> {
  return uploadSettings(await getPublicCatalog()).maxMb * 1024 * 1024;
}

async function slot(bucket: "evidence" | "documents", path: string, size: number, name: string, allowed: readonly string[]): Promise<UploadSlot> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!allowed.includes(ext)) return { ok: false, error: "badType" };
  const max = await maxBytes();
  if (!Number.isFinite(size) || size <= 0 || size > max) return { ok: false, error: "tooLarge" };
  try {
    return { ok: true, ...(await signedUploadUrl(bucket, path, { maxBytes: max, expiresIn: 3600 })), path };
  } catch {
    return { ok: false, error: "generic" };
  }
}

async function verify(bucket: "evidence" | "documents", path: string, name: string, kinds: readonly DetectedKind[]): Promise<{ kind: DetectedKind; size: number } | { error: "typeMismatch" | "tooLarge" | "network" }> {
  const head = await readObjectHead(bucket, path, 2048);
  if (!head) return { error: "network" };
  const kind = detectFileKind(head.head, name);
  if (!kinds.includes(kind)) {
    await removeObject(bucket, path).catch(() => {});
    return { error: "typeMismatch" };
  }
  if (head.size > (await maxBytes())) {
    await removeObject(bucket, path).catch(() => {});
    return { error: "tooLarge" };
  }
  return { kind, size: head.size };
}

export async function prepareEvidenceUpload(user: CurrentUser, milestoneId: string, file: { name: string; size: number }): Promise<UploadSlot> {
  if (!isEditor(user) || !UUID.test(milestoneId)) return { ok: false, error: "expired" };
  const [m] = await withActor(actorFor(user), (tx) => tx<{ order_id: string; files: number }[]>`
    select order_id, jsonb_array_length(evidence) as files from public.milestones where id = ${milestoneId}`);
  if (!m) return { ok: false, error: "expired" };
  if (m.files >= MAX_EVIDENCE) return { ok: false, error: "tooMany" };
  return slot("evidence", `orders/${m.order_id}/${milestoneId}/${fileNonce()}-${safeName(file.name)}`, file.size, file.name, EVIDENCE_EXT);
}

export async function confirmEvidenceUpload(user: CurrentUser, milestoneId: string, input: { path: string; name: string }): Promise<UploadConfirm> {
  if (!isEditor(user) || !UUID.test(milestoneId)) return { ok: false, error: "expired" };
  const [m] = await withActor(actorFor(user), (tx) => tx<{ order_id: string; request_id: string }[]>`
    select m.order_id, o.request_id from public.milestones m join public.orders o on o.id = m.order_id where m.id = ${milestoneId}`);
  if (!m || !input.path.startsWith(`orders/${m.order_id}/${milestoneId}/`) || input.path.includes("..")) return { ok: false, error: "generic" };
  const checked = await verify("evidence", input.path, input.name, EVIDENCE_KINDS);
  if ("error" in checked) return { ok: false, error: checked.error };
  const evidence: Evidence = { path: input.path, kind: checked.kind, name: input.name.slice(0, 200), size: checked.size };
  await withActor(actorFor(user), async (tx) => {
    await tx`update public.milestones set evidence = evidence || ${tx.json([evidence] as never)} where id = ${milestoneId}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${m.request_id}, 'milestone', ${milestoneId}, ${user.userId}, 'system', 'evidence_uploaded', ${evidence.name})`;
  });
  return { ok: true, file: { id: input.path.split("/").pop() ?? input.path, name: evidence.name, size: evidence.size, path: evidence.path, kind: evidence.kind } };
}

/** URL firmada de una evidencia (equipo o cliente con su enlace). */
export async function evidenceUrl(access: { user: CurrentUser } | { token: string }, orderId: string, path: string): Promise<string | null> {
  if (!UUID.test(orderId) || !path.startsWith(`orders/${orderId}/`) || path.includes("..")) return null;
  if ("token" in access) {
    const request = await getRequestByToken(access.token);
    if (!request) return null;
  }
  const actor = "user" in access ? actorFor(access.user) : { kind: "anon" as const, accessToken: access.token };
  const rows = await withActor(actor, (tx) => tx<{ evidence: Evidence[] }[]>`
    select m.evidence from public.milestones m where m.order_id = ${orderId}`);
  if (!rows.some((r) => (r.evidence ?? []).some((e) => e.path === path))) return null;
  return signedUrl("evidence", path, { expiresIn: 600 });
}

/** Comprobante de pago que sube el cliente: queda "por confirmar" para el equipo. */
export async function prepareReceiptUpload(accessToken: string, file: { name: string; size: number }): Promise<UploadSlot> {
  const order = await clientOrderRow(accessToken);
  if (!order || order.status === "closed") return { ok: false, error: "expired" };
  // Tope de comprobantes sin revisar (cada uno avisa al equipo).
  const [pending] = await withActor(serviceActor, (tx) => tx<{ n: number }[]>`
    select count(*)::int as n from public.payments where order_id = ${order.id} and status = 'pending' and uploaded_by_client`);
  if ((pending?.n ?? 0) >= MAX_PENDING_RECEIPTS) return { ok: false, error: "tooMany" };
  return slot("documents", `orders/${order.id}/receipts/${fileNonce()}-${safeName(file.name)}`, file.size, file.name, RECEIPT_EXT);
}

export async function confirmReceiptUpload(accessToken: string, input: { path: string; name: string }): Promise<UploadConfirm> {
  const order = await clientOrderRow(accessToken);
  if (!order || order.status === "closed" || !input.path.startsWith(`orders/${order.id}/receipts/`) || input.path.includes("..")) return { ok: false, error: "expired" };
  const checked = await verify("documents", input.path, input.name, RECEIPT_KINDS);
  if ("error" in checked) return { ok: false, error: checked.error };
  await withActor(serviceActor, async (tx) => {
    const [dep] = await tx<{ ok: boolean }[]>`
      select exists (select 1 from public.payments where order_id = ${order.id} and kind = 'deposit' and status = 'confirmed') as ok`;
    const kind: PaymentKind = dep?.ok ? "balance" : "deposit";
    const [p] = await tx<{ id: string }[]>`
      insert into public.payments (order_id, kind, status, receipt_path, uploaded_by_client, notes)
      values (${order.id}, ${kind}, 'pending', ${input.path}, true, ${input.name.slice(0, 200)}) returning id`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, channel, kind, body)
      values (${order.request_id}, 'payment', ${p!.id}, 'system', 'receipt_uploaded', ${kind})`;
  });
  await enqueueNotification("receipt_uploaded", order.request_id, {
    entityType: "order",
    entityId: order.id,
    vars: { numero_pedido: order.number },
    dedupe: `receipt:${input.path}`,
  });
  return { ok: true, file: { id: input.path.split("/").pop() ?? input.path, name: input.name, size: checked.size, path: input.path, kind: checked.kind } };
}

export async function receiptUrl(user: CurrentUser, paymentId: string): Promise<string | null> {
  if (!UUID.test(paymentId)) return null;
  const rows = await withActor(actorFor(user), (tx) => tx<{ receipt_path: string | null }[]>`select receipt_path from public.payments where id = ${paymentId}`);
  const path = rows[0]?.receipt_path;
  return path ? signedUrl("documents", path, { expiresIn: 300 }) : null;
}

// ---------------------------------------------------------------------------
// Cliente (enlace seguro)
// ---------------------------------------------------------------------------
async function clientOrderRow(accessToken: string): Promise<{ id: string; number: string; request_id: string; status: OrderStatus } | null> {
  const request = await getRequestByToken(accessToken);
  if (!request) return null;
  const rows = await withActor({ kind: "anon", accessToken }, (tx) => tx<{ id: string; number: string; request_id: string; status: OrderStatus }[]>`
    select id, number, request_id, status from public.orders where request_id = ${request.id} order by created_at desc limit 1`);
  return rows[0] ?? null;
}

export type ClientOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  estimatedDeliveryDate: string | null;
  transport: string | null;
  tracking: string | null;
  eta: string | null;
  deliveredAt: Date | null;
  milestones: { id: string; type: MilestoneType; occurredAt: Date; notes: string | null; evidence: (Evidence & { url: string })[]; qa: { label: string; expected: string; result: string | null }[] | null }[];
  payments: { deposit: PaymentStatus | "none"; balance: PaymentStatus | "none" };
  /** Montos de la cotización aceptada (D-101): se leen en el servidor tras validar el enlace. */
  amounts: { currency: string; total: number; deposit: number; balance: number; paidDeposit: number; paidBalance: number };
  /** Cada pago o comprobante, con su monto si ya está confirmado. */
  paymentList: { id: string; kind: PaymentKind; status: PaymentStatus; amount: number | null; paidOn: string | null; createdAt: Date; uploadedByClient: boolean }[];
  surveyDone: boolean;
  quoteId: string;
  depositPct: number;
  paymentInstructions: string;
};

/**
 * Pedido visto por el cliente con su enlace: etapas, evidencias, montos de la
 * cotización aceptada y estado de cada pago (D-101). El rol anónimo sigue sin
 * permiso sobre las columnas de montos: se leen con la clave de servicio
 * después de validar el enlace.
 */
export async function getClientOrder(accessToken: string): Promise<ClientOrder | null> {
  const row = await clientOrderRow(accessToken);
  if (!row) return null;
  return withActor({ kind: "anon", accessToken }, async (tx) => {
    const [o] = await tx<{ estimated_delivery_date: string | null; transport: string | null; tracking: string | null; eta: string | null; delivered_at: Date | null }[]>`
      select to_char(estimated_delivery_date, 'YYYY-MM-DD') as estimated_delivery_date, transport, tracking, to_char(eta, 'YYYY-MM-DD') as eta, delivered_at
        from public.orders where id = ${row.id}`;
    const milestones = await tx<{ id: string; type: MilestoneType; occurred_at: Date; notes: string | null; evidence: Evidence[]; qa_checklist: QaPoint[] | null }[]>`
      select id, type, occurred_at, notes, evidence, qa_checklist from public.milestones where order_id = ${row.id} order by occurred_at`;
    const payments = await tx<{ kind: PaymentKind; status: PaymentStatus }[]>`select kind, status from public.payments where order_id = ${row.id} order by created_at`;
    const status = (kind: PaymentKind): PaymentStatus | "none" => {
      const list = payments.filter((p) => p.kind === kind);
      if (list.some((p) => p.status === "confirmed")) return "confirmed";
      if (list.some((p) => p.status === "pending")) return "pending";
      return list.length ? "rejected" : "none";
    };
    const extra = await withActor(serviceActor, (s) => s<
      { quote_id: string; deposit_pct: number; survey: boolean; instructions: unknown; currency: string; total_amount: string; deposit_amount: string; balance_amount: string }[]
    >`
      select o.quote_id, o.deposit_pct, exists (select 1 from public.surveys v where v.order_id = o.id) as survey,
             (select value from public.settings where key = 'payment_instructions') as instructions,
             o.currency, o.total_amount, o.deposit_amount, o.balance_amount
        from public.orders o where o.id = ${row.id}`);
    const paymentRows = await withActor(serviceActor, (s) => s<
      { id: string; kind: PaymentKind; status: PaymentStatus; amount: string | null; paid_on: string | null; created_at: Date; uploaded_by_client: boolean }[]
    >`
      select id, kind, status, amount, to_char(paid_on, 'YYYY-MM-DD') as paid_on, created_at, uploaded_by_client
        from public.payments where order_id = ${row.id} order by created_at`);
    const paid = (kind: PaymentKind) =>
      paymentRows.filter((p) => p.kind === kind && p.status === "confirmed").reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      estimatedDeliveryDate: o?.estimated_delivery_date ?? null,
      transport: o?.transport ?? null,
      tracking: o?.tracking ?? null,
      eta: o?.eta ?? null,
      deliveredAt: o?.delivered_at ?? null,
      milestones: await Promise.all(
        milestones.map(async (m) => ({
          id: m.id,
          type: m.type,
          occurredAt: m.occurred_at,
          notes: m.notes,
          evidence: await Promise.all((m.evidence ?? []).map(async (e) => ({ ...e, url: await signedUrl("evidence", e.path, { expiresIn: 600 }) }))),
          qa: m.qa_checklist?.map((p) => ({ label: p.label, expected: p.expected, result: p.result })) ?? null,
        })),
      ),
      payments: { deposit: status("deposit"), balance: status("balance") },
      amounts: {
        currency: extra[0]?.currency ?? "USD",
        total: Number(extra[0]?.total_amount ?? 0),
        deposit: Number(extra[0]?.deposit_amount ?? 0),
        balance: Number(extra[0]?.balance_amount ?? 0),
        paidDeposit: round2(paid("deposit")),
        paidBalance: round2(paid("balance")),
      },
      paymentList: paymentRows.map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        amount: p.status === "confirmed" && p.amount !== null ? Number(p.amount) : null,
        paidOn: p.paid_on,
        createdAt: p.created_at,
        uploadedByClient: p.uploaded_by_client,
      })),
      surveyDone: Boolean(extra[0]?.survey),
      quoteId: extra[0]?.quote_id ?? "",
      depositPct: extra[0]?.deposit_pct ?? 0,
      paymentInstructions: typeof extra[0]?.instructions === "string" ? (extra[0]?.instructions as string) : "",
    };
  });
}

/** Datos para "Pedir de nuevo": piezas del pedido con la cantidad pedida y el contacto. */
export async function getReorderSource(accessToken: string): Promise<ReorderSource | null> {
  const request = await getRequestByToken(accessToken);
  if (!request) return null;
  const order = await clientOrderRow(accessToken);
  if (!order) return null;
  const [o] = await withActor(serviceActor, (tx) => tx<{ lines: { item_id: string; position: number; quantity: number }[] }[]>`
    select lines from public.orders where id = ${order.id}`);
  const lines = (o?.lines ?? []).flatMap((l) => {
    const item = request.items.find((i) => i.id === l.item_id);
    return item ? [{ position: l.position, quantity: Number(l.quantity), spec: item.spec }] : [];
  });
  return {
    segment: request.segment,
    company: request.companyName,
    contactName: request.contactName,
    email: request.contactEmail,
    whatsapp: request.contactWhatsapp,
    city: request.deliveryCity,
    address: request.deliveryAddress,
    comment: serverT("tracking")("order.reorderComment", { number: order.number }),
    lines,
  };
}

/** Encuesta NPS (0 a 10) al cerrar el pedido; una por pedido. */
export async function submitSurvey(accessToken: string, input: { score: number; comment: string; ip: string | null }): Promise<OrderResult> {
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) return { ok: false, error: "score" };
  const order = await clientOrderRow(accessToken);
  if (!order) return { ok: false, error: "not_found" };
  if (order.status !== "closed" && order.status !== "delivered") return { ok: false, error: "status" };
  const rows = await withActor(serviceActor, (tx) => tx`
    insert into public.surveys (order_id, request_id, score, comment, ip)
    values (${order.id}, ${order.request_id}, ${input.score}, ${input.comment.trim().slice(0, 2000) || null}, ${input.ip})
    on conflict (order_id) do nothing returning id`);
  return rows.length ? { ok: true } : { ok: false, error: "status" };
}

// ---------------------------------------------------------------------------
// Procesos programados: saldo (2 y 5 días tras la entrega) y NPS (7 días tras el cierre)
// ---------------------------------------------------------------------------
export async function balanceReminders(now: Date = new Date()): Promise<number> {
  const orders = await withActor(serviceActor, (tx) => tx<{ id: string; number: string; request_id: string; delivered_at: Date; balance_amount: string; currency: string }[]>`
    select o.id, o.number, o.request_id, o.delivered_at, o.balance_amount, o.currency from public.orders o
     where o.status = 'delivered' and o.delivered_at is not null and o.balance_amount > 0
       and not exists (select 1 from public.payments p where p.order_id = o.id and p.kind = 'balance' and p.status = 'confirmed')`);
  let queued = 0;
  for (const o of orders) {
    const due = balanceReminderDue(o.delivered_at, now);
    if (due === null) continue;
    queued += await enqueueNotification("balance_reminder", o.request_id, {
      entityType: "order",
      entityId: o.id,
      vars: { numero_pedido: o.number, monto: formatMoney(Number(o.balance_amount), o.currency), fecha: formatDate(o.delivered_at) },
      dedupe: `balance_reminder:${o.id}:${due}`,
    });
  }
  return queued;
}

export async function npsSurveys(now: Date = new Date()): Promise<number> {
  const orders = await withActor(serviceActor, (tx) => tx<{ id: string; number: string; request_id: string; closed_at: Date; access_token: string }[]>`
    select o.id, o.number, o.request_id, o.closed_at, r.access_token from public.orders o join public.quote_requests r on r.id = o.request_id
     where o.status = 'closed' and o.closed_at is not null and not exists (select 1 from public.surveys s where s.order_id = o.id)`);
  let queued = 0;
  for (const o of orders) {
    if (!npsDue(o.closed_at, now)) continue;
    queued += await enqueueNotification("nps_survey", o.request_id, {
      entityType: "order",
      entityId: o.id,
      vars: { numero_pedido: o.number, enlace: absoluteUrl(`/seguimiento/${o.access_token}#encuesta`) },
      dedupe: `nps:${o.id}`,
    });
  }
  return queued;
}
