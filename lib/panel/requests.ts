import "server-only";
import { actorFor, EDITOR_ROLES, type CurrentUser } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { businessHoursBetween, parseBusinessHours, type BusinessHours } from "@/lib/notify/business-hours";
import type { ItemSpec } from "@/lib/quote/spec";
import { canTransition, LOSS_REASONS, type LossReason, type RequestStatus } from "@/lib/states";
import type { MissingField } from "@/lib/traffic-light";

/**
 * Solicitudes en el panel (PRD §11): bandeja con SLA, detalle, asignación,
 * cambios de estado validados por la máquina de §14, notas internas y
 * registro de contactos. Toda escritura exige rol editor (el viewer solo lee)
 * y RLS lo vuelve a comprobar en la base.
 */
const UUID = /^[0-9a-f-]{36}$/i;

export type SlaState = { kind: "first" | "quote" | null; hours: number; limit: number; overdue: boolean };

export type SlaSettings = { hours: BusinessHours; firstHours: number; quoteHours: number };

export async function slaSettings(tx: Tx): Promise<SlaSettings> {
  const rows = await tx<{ key: string; value: unknown }[]>`
    select key, value from public.settings where key in ('business_hours', 'first_response_sla_hours', 'quote_sla_hours')`;
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  return { hours: parseBusinessHours(get("business_hours")), firstHours: Number(get("first_response_sla_hours") ?? 4), quoteHours: Number(get("quote_sla_hours") ?? 24) };
}

/** SLA vigente de una solicitud: primera respuesta (Enviada) o cotización (En revisión / RFQ enviado). */
export function slaFor(r: { status: RequestStatus; submittedAt: Date; inReviewAt: Date | null }, cfg: SlaSettings, now = new Date()): SlaState {
  if (r.status === "submitted") {
    const hours = businessHoursBetween(r.submittedAt, now, cfg.hours);
    return { kind: "first", hours, limit: cfg.firstHours, overdue: hours >= cfg.firstHours };
  }
  if (r.status === "in_review" || r.status === "rfq_sent") {
    const hours = businessHoursBetween(r.inReviewAt ?? r.submittedAt, now, cfg.hours);
    return { kind: "quote", hours, limit: cfg.quoteHours, overdue: hours >= cfg.quoteHours };
  }
  return { kind: null, hours: 0, limit: 0, overdue: false };
}

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------
export type InboxFilters = {
  status?: RequestStatus[];
  segment?: "commercial" | "food" | "unsure";
  light?: "green" | "yellow" | "red";
  from?: string;
  to?: string;
  minQty?: number;
  maxQty?: number;
  assigned?: "me" | "none" | string;
  q?: string;
};

export type InboxRow = {
  id: string;
  number: string;
  status: RequestStatus;
  segment: "commercial" | "food" | "unsure";
  trafficLight: "green" | "yellow" | "red";
  company: string;
  contactName: string;
  /** Tipo de cada pieza (null: a sugerencia del equipo). */
  pieces: (string | null)[];
  maxQuantity: number | null;
  submittedAt: Date;
  assignedTo: string | null;
  assignedName: string | null;
  sla: SlaState;
};

const LIGHT_RANK = { red: 0, yellow: 1, green: 2 } as const;
const OPEN: readonly RequestStatus[] = ["submitted", "in_review", "data_pending", "rfq_sent", "quoted"];

export async function listInbox(user: CurrentUser, filters: InboxFilters, now = new Date()): Promise<InboxRow[]> {
  const statuses = filters.status?.length ? filters.status : OPEN;
  return withActor(actorFor(user), async (tx) => {
    const cfg = await slaSettings(tx);
    const assigned =
      filters.assigned === "me" ? tx`and r.assigned_to = ${user.userId}` : filters.assigned === "none" ? tx`and r.assigned_to is null` : filters.assigned && UUID.test(filters.assigned) ? tx`and r.assigned_to = ${filters.assigned}` : tx``;
    const q = filters.q?.trim() ? `%${filters.q.trim().toLowerCase()}%` : null;
    const rows = await tx<
      {
        id: string;
        number: string;
        status: RequestStatus;
        segment: InboxRow["segment"];
        traffic_light: InboxRow["trafficLight"];
        company_name: string | null;
        contact_name: string;
        submitted_at: Date;
        in_review_at: Date | null;
        assigned_to: string | null;
        assigned_name: string | null;
        pieces: (string | null)[] | null;
        max_qty: number | null;
      }[]
    >`
      select r.id, r.number, r.status, r.segment, r.traffic_light, r.company_name, r.contact_name, r.submitted_at, r.in_review_at, r.assigned_to,
             coalesce(p.name, p.email) as assigned_name,
             (select json_agg(i.spec_snapshot #>> '{type,name}' order by i.position) from public.quote_items i where i.request_id = r.id) as pieces,
             (select max(q) from public.quote_items i, unnest(i.quantities) q where i.request_id = r.id) as max_qty
        from public.quote_requests r
        left join public.profiles p on p.user_id = r.assigned_to
       where r.status = any(${statuses}::public.request_status[])
         ${filters.segment ? tx`and r.segment = ${filters.segment}` : tx``}
         ${filters.light ? tx`and r.traffic_light = ${filters.light}` : tx``}
         ${filters.from ? tx`and r.submitted_at >= ${filters.from}::date` : tx``}
         ${filters.to ? tx`and r.submitted_at < ${filters.to}::date + 1` : tx``}
         ${assigned}
         ${q ? tx`and (lower(r.number) like ${q} or lower(coalesce(r.company_name, '')) like ${q} or lower(r.contact_name) like ${q})` : tx``}
       order by r.submitted_at desc
       limit 500`;
    return rows
      .map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        segment: r.segment,
        trafficLight: r.traffic_light,
        company: r.company_name || r.contact_name,
        contactName: r.contact_name,
        pieces: r.pieces ?? [],
        maxQuantity: r.max_qty,
        submittedAt: r.submitted_at,
        assignedTo: r.assigned_to,
        assignedName: r.assigned_name,
        sla: slaFor({ status: r.status, submittedAt: r.submitted_at, inReviewAt: r.in_review_at }, cfg, now),
      }))
      .filter((r) => (filters.minQty ? (r.maxQuantity ?? 0) >= filters.minQty : true) && (filters.maxQty ? (r.maxQuantity ?? 0) <= filters.maxQty : true))
      .sort(
        // Urgencia (PRD §11): SLA vencido primero; dentro, rojo antes que amarillo y verde; luego la más antigua.
        (a, b) =>
          Number(b.sla.overdue) - Number(a.sla.overdue) ||
          LIGHT_RANK[a.trafficLight] - LIGHT_RANK[b.trafficLight] ||
          b.sla.hours - b.sla.limit - (a.sla.hours - a.sla.limit) ||
          a.submittedAt.getTime() - b.submittedAt.getTime(),
      );
  });
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------
export type RequestDetail = {
  id: string;
  number: string;
  status: RequestStatus;
  segment: "commercial" | "food" | "unsure";
  trafficLight: "green" | "yellow" | "red";
  missingFields: { item: number; field: MissingField }[];
  companyId: string | null;
  companyName: string | null;
  ruc: string | null;
  contactName: string;
  contactPosition: string | null;
  contactEmail: string | null;
  contactWhatsapp: string | null;
  deliveryCity: string | null;
  deliveryAddress: string | null;
  desiredDate: string | null;
  comments: string | null;
  leadSource: string | null;
  needsAdvice: boolean;
  utm: Record<string, string>;
  submittedAt: Date;
  assignedTo: string | null;
  assignedName: string | null;
  lossReason: LossReason | null;
  lossNote: string | null;
  sla: SlaState;
  items: { id: string; position: number; spec: ItemSpec }[];
  references: { itemId: string; kind: "photo" | "link" | "gallery_sample"; url: string | null; storagePath: string | null; note: string | null; sampleCode: string | null; sampleName: string | null }[];
};

export async function getRequestDetail(user: CurrentUser, id: string, now = new Date()): Promise<RequestDetail | null> {
  if (!UUID.test(id)) return null;
  return withActor(actorFor(user), async (tx) => {
    const [r] = await tx<
      {
        id: string;
        number: string;
        status: RequestStatus;
        segment: RequestDetail["segment"];
        traffic_light: RequestDetail["trafficLight"];
        missing_fields: string[];
        company_id: string | null;
        company_name: string | null;
        ruc: string | null;
        contact_name: string;
        contact_position: string | null;
        contact_email: string | null;
        contact_whatsapp: string | null;
        delivery_city: string | null;
        delivery_address: string | null;
        desired_date: string | null;
        comments: string | null;
        lead_source: string | null;
        needs_advice: boolean;
        utm: Record<string, string>;
        submitted_at: Date;
        in_review_at: Date | null;
        assigned_to: string | null;
        assigned_name: string | null;
        loss_reason: LossReason | null;
        loss_note: string | null;
      }[]
    >`
      select r.id, r.number, r.status, r.segment, r.traffic_light, r.missing_fields, r.company_id, r.company_name, r.ruc,
             r.contact_name, r.contact_position, r.contact_email, r.contact_whatsapp, r.delivery_city, r.delivery_address,
             to_char(r.desired_date, 'YYYY-MM-DD') as desired_date, r.comments, r.lead_source, r.needs_advice, r.utm, r.submitted_at, r.in_review_at,
             r.assigned_to, coalesce(p.name, p.email) as assigned_name, r.loss_reason, r.loss_note
        from public.quote_requests r
        left join public.profiles p on p.user_id = r.assigned_to
       where r.id = ${id}`;
    if (!r) return null;
    const cfg = await slaSettings(tx);
    const items = await tx<{ id: string; position: number; spec_snapshot: ItemSpec }[]>`
      select id, position, spec_snapshot from public.quote_items where request_id = ${id} order by position`;
    const refs = await tx<
      { item_id: string; kind: "photo" | "link" | "gallery_sample"; url: string | null; storage_path: string | null; note: string | null; code: string | null; name: string | null }[]
    >`
      select q.item_id, q.kind, q.url, q.storage_path, q.note, g.code, g.name
        from public.quote_references q
        join public.quote_items i on i.id = q.item_id
        left join public.gallery_samples g on g.id = q.gallery_sample_id
       where i.request_id = ${id}
       order by i.position, q.created_at`;
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      segment: r.segment,
      trafficLight: r.traffic_light,
      missingFields: (r.missing_fields ?? []).map((m) => {
        const [item, field] = m.split(":");
        return { item: Number(item), field: field as MissingField };
      }),
      companyId: r.company_id,
      companyName: r.company_name,
      ruc: r.ruc,
      contactName: r.contact_name,
      contactPosition: r.contact_position,
      contactEmail: r.contact_email,
      contactWhatsapp: r.contact_whatsapp,
      deliveryCity: r.delivery_city,
      deliveryAddress: r.delivery_address,
      desiredDate: r.desired_date,
      comments: r.comments,
      leadSource: r.lead_source,
      needsAdvice: r.needs_advice,
      utm: r.utm ?? {},
      submittedAt: r.submitted_at,
      assignedTo: r.assigned_to,
      assignedName: r.assigned_name,
      lossReason: r.loss_reason,
      lossNote: r.loss_note,
      sla: slaFor({ status: r.status, submittedAt: r.submitted_at, inReviewAt: r.in_review_at }, cfg, now),
      items: items.map((i) => ({ id: i.id, position: i.position, spec: i.spec_snapshot })),
      references: refs.map((q) => ({ itemId: q.item_id, kind: q.kind, url: q.url, storagePath: q.storage_path, note: q.note, sampleCode: q.code, sampleName: q.name })),
    };
  });
}

// ---------------------------------------------------------------------------
// Historial: estados + actividades (notas, contactos, respuestas, avisos)
// ---------------------------------------------------------------------------
export type TimelineEntry =
  | { type: "status"; at: Date; from: RequestStatus | null; to: RequestStatus; reason: string | null; by: string | null }
  | { type: "activity"; at: Date; kind: string; channel: string; body: string | null; by: string | null; payload: Record<string, unknown> };

export async function getTimeline(user: CurrentUser, id: string): Promise<TimelineEntry[]> {
  if (!UUID.test(id)) return [];
  return withActor(actorFor(user), async (tx) => {
    const status = await tx<{ changed_at: Date; from_status: RequestStatus | null; to_status: RequestStatus; reason: string | null; by: string | null }[]>`
      select l.changed_at, l.from_status, l.to_status, l.reason, coalesce(p.name, p.email) as by
        from public.quote_request_status_log l left join public.profiles p on p.user_id = l.changed_by
       where l.request_id = ${id}`;
    const acts = await tx<{ created_at: Date; kind: string; channel: string; body: string | null; by: string | null; payload: Record<string, unknown> }[]>`
      select a.created_at, a.kind, a.channel, a.body, coalesce(p.name, p.email) as by, a.payload
        from public.activities a left join public.profiles p on p.user_id = a.user_id
       where a.request_id = ${id} and a.kind <> 'submitted'`;
    const entries: TimelineEntry[] = [
      ...status.map((s) => ({ type: "status" as const, at: s.changed_at, from: s.from_status, to: s.to_status, reason: s.reason, by: s.by })),
      ...acts.map((a) => ({ type: "activity" as const, at: a.created_at, kind: a.kind, channel: a.channel, body: a.body, by: a.by, payload: a.payload ?? {} })),
    ];
    return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  });
}

// ---------------------------------------------------------------------------
// Escrituras (solo editores)
// ---------------------------------------------------------------------------
export type ActionResult = { ok: true } | { ok: false; error: "forbidden" | "not_found" | "transition" | "loss_reason" | "reason" | "body" | "assignee" };

function isEditor(user: CurrentUser): boolean {
  return user.isActive && EDITOR_ROLES.includes(user.role);
}

export type StaffOption = { userId: string; name: string; role: string };

export async function listAssignableStaff(user: CurrentUser): Promise<StaffOption[]> {
  const rows = await withActor(actorFor(user), (tx) => tx<{ user_id: string; name: string | null; email: string | null; role: string }[]>`
    select user_id, name, email, role from public.profiles where is_active and role in ('admin', 'sales', 'ops') order by coalesce(name, email)`);
  return rows.map((r) => ({ userId: r.user_id, name: r.name || r.email || r.user_id, role: r.role }));
}

/**
 * Asigna la solicitud: a una persona del equipo, a quien la toma ("me") o al
 * siguiente en turno (ventas activas, por orden de última asignación).
 */
export async function assignRequest(user: CurrentUser, id: string, to: "me" | "next" | "none" | string): Promise<ActionResult & { assignee?: string | null }> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  return withActor(actorFor(user), async (tx) => {
    let assignee: string | null;
    if (to === "me") assignee = user.userId;
    else if (to === "none") assignee = null;
    else if (to === "next") {
      const [next] = await tx<{ user_id: string }[]>`
        select user_id from public.profiles
         where is_active and role = 'sales'
         order by last_assigned_at asc nulls first, created_at asc
         limit 1`;
      assignee = next?.user_id ?? user.userId;
    } else {
      if (!UUID.test(to)) return { ok: false, error: "assignee" } as const;
      const [p] = await tx<{ user_id: string }[]>`
        select user_id from public.profiles where user_id = ${to} and is_active and role in ('admin', 'sales', 'ops')`;
      if (!p) return { ok: false, error: "assignee" } as const;
      assignee = p.user_id;
    }
    const updated = await tx`update public.quote_requests set assigned_to = ${assignee} where id = ${id} returning id`;
    if (!updated.length) return { ok: false, error: "not_found" } as const;
    if (assignee) await tx`update public.profiles set last_assigned_at = now() where user_id = ${assignee}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body, payload)
      values (${id}, 'quote_request', ${id}, ${user.userId}, 'system', 'assigned', ${assignee}, ${tx.json({ to: assignee, mode: to === "me" || to === "next" || to === "none" ? to : "user" })})`;
    return { ok: true, assignee } as const;
  });
}

/**
 * Cambia el estado respetando la máquina de §14 (la base lo vuelve a validar).
 * Rechazada exige motivo de la lista cerrada. El motivo queda en el historial.
 */
export async function changeRequestStatus(
  user: CurrentUser,
  id: string,
  to: RequestStatus,
  opts: { reason?: string; lossReason?: string; lossNote?: string } = {},
): Promise<ActionResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  const reason = opts.reason?.trim().slice(0, 1000) || null;
  const lossReason = opts.lossReason && (LOSS_REASONS as readonly string[]).includes(opts.lossReason) ? (opts.lossReason as LossReason) : null;
  if (to === "rejected" && !lossReason) return { ok: false, error: "loss_reason" };
  if (to === "data_pending" && !reason) return { ok: false, error: "reason" };
  return withActor(actorFor(user), async (tx) => {
    const [current] = await tx<{ status: RequestStatus }[]>`select status from public.quote_requests where id = ${id} for update`;
    if (!current) return { ok: false, error: "not_found" } as const;
    if (!canTransition(current.status, to)) return { ok: false, error: "transition" } as const;
    await tx`select set_config('app.transition_reason', ${reason ?? ""}, true)`;
    await tx`
      update public.quote_requests
         set status = ${to},
             loss_reason = ${to === "rejected" ? lossReason : tx`loss_reason`},
             loss_note = ${to === "rejected" ? opts.lossNote?.trim().slice(0, 1000) || null : tx`loss_note`}
       where id = ${id}`;
    return { ok: true } as const;
  });
}

/**
 * "Pedir datos faltantes": pasa la solicitud a Datos pendientes con la lista
 * exacta (si estaba Enviada, primero la toma a revisión). La notificación al
 * cliente sale con esa lista (plantilla data_missing).
 */
export async function requestMissingData(user: CurrentUser, id: string, list: string): Promise<ActionResult> {
  const text = list.trim();
  if (text.length < 3) return { ok: false, error: "reason" };
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  return withActor(actorFor(user), async (tx) => {
    const [current] = await tx<{ status: RequestStatus }[]>`select status from public.quote_requests where id = ${id} for update`;
    if (!current) return { ok: false, error: "not_found" } as const;
    if (current.status === "submitted") await tx`update public.quote_requests set status = 'in_review' where id = ${id}`;
    else if (current.status !== "in_review") return { ok: false, error: "transition" } as const;
    await tx`select set_config('app.transition_reason', ${text.slice(0, 1000)}, true)`;
    await tx`update public.quote_requests set status = 'data_pending' where id = ${id}`;
    return { ok: true } as const;
  });
}

export const NOTE_CHANNELS = ["note", "whatsapp", "email", "call"] as const;
export type NoteChannel = (typeof NOTE_CHANNELS)[number];

/** Nota interna (canal "note") o registro de un contacto con el cliente (WhatsApp, correo, llamada). */
export async function addRequestNote(user: CurrentUser, id: string, input: { channel: string; body: string }): Promise<ActionResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(id)) return { ok: false, error: "not_found" };
  const body = input.body.trim().slice(0, 4000);
  if (body.length < 2) return { ok: false, error: "body" };
  const channel: NoteChannel = (NOTE_CHANNELS as readonly string[]).includes(input.channel) ? (input.channel as NoteChannel) : "note";
  return withActor(actorFor(user), async (tx) => {
    const rows = await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      select ${id}, 'quote_request', ${id}, ${user.userId}, ${channel}, ${channel === "note" ? "note" : "contact"}, ${body}
       where exists (select 1 from public.quote_requests where id = ${id})
      returning id`;
    return rows.length ? ({ ok: true } as const) : ({ ok: false, error: "not_found" } as const);
  });
}
