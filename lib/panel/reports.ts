import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import type { CsvValue } from "@/lib/csv";
import { withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { serverT } from "@/lib/i18n";
import { addDays, todayInPanama } from "@/lib/leadtime";
import { REQUEST_STATUSES } from "@/lib/states";

/**
 * Reportes del panel (PRD §11): cada reporte es una tabla con columnas
 * tipadas; la pantalla y el CSV salen de la misma tabla.
 */
export const REPORT_KEYS = ["pipeline", "requestTimes", "orderTimes", "conversion", "types", "materials", "losses", "ordersDue", "channels"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export type ColumnKind = "text" | "int" | "dec" | "pct" | "date";
export type ReportTable = { key: ReportKey; title: string; note: string | null; columns: { label: string; kind: ColumnKind }[]; rows: CsvValue[][] };
export type ReportRange = { from: string; to: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round1 = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

/** Período por defecto: los últimos 90 días hasta hoy (Panamá). */
export function resolveRange(input: { from?: string | null; to?: string | null }, today = todayInPanama()): ReportRange {
  const to = input.to && DATE.test(input.to) && input.to <= today ? input.to : today;
  const defaultFrom = addDays(new Date(`${to}T12:00:00Z`), -89).toISOString().slice(0, 10);
  const from = input.from && DATE.test(input.from) && input.from <= to ? input.from : defaultFrom;
  return { from, to };
}

type T = ReturnType<typeof serverT<"admin">>;

function inRange(tx: Tx, column: string, range: ReportRange) {
  return tx`(${tx(column)} at time zone 'America/Panama')::date between ${range.from}::date and ${range.to}::date`;
}

async function pipeline(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  const rows = await tx<{ status: string; n: number }[]>`
    select status, count(*)::int as n from public.quote_requests r where ${inRange(tx, "r.submitted_at", range)} group by status`;
  return {
    key: "pipeline",
    title: t("reports.tables.pipeline"),
    note: null,
    columns: [
      { label: t("reports.columns.status"), kind: "text" },
      { label: t("reports.columns.requests"), kind: "int" },
    ],
    rows: REQUEST_STATUSES.filter((s) => s !== "draft").map((s) => [t(`statuses.${s}`), rows.find((r) => r.status === s)?.n ?? 0]),
  };
}

type Stat = { n: number; median: number | null; avg: number | null };

async function requestTimes(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  const pairs = [
    ["firstResponse", "submitted_at", "in_review_at"],
    ["toRfq", "in_review_at", "rfq_sent_at"],
    ["toQuote", "rfq_sent_at", "quoted_at"],
    ["toAccept", "quoted_at", "accepted_at"],
    ["requestTotal", "submitted_at", "quoted_at"],
  ] as const;
  const rows: CsvValue[][] = [];
  for (const [key, a, b] of pairs) {
    const [s] = await tx<Stat[]>`
      select count(*)::int as n,
             percentile_cont(0.5) within group (order by extract(epoch from (${tx(b)} - ${tx(a)})) / 3600) as median,
             avg(extract(epoch from (${tx(b)} - ${tx(a)})) / 3600) as avg
        from public.quote_requests r
       where ${inRange(tx, "r.submitted_at", range)} and ${tx(a)} is not null and ${tx(b)} is not null and ${tx(b)} >= ${tx(a)}`;
    rows.push([t(`reports.stages.${key}`), s?.n ?? 0, round1(s?.median === null ? null : Number(s?.median)), round1(s?.avg === null ? null : Number(s?.avg))]);
  }
  return {
    key: "requestTimes",
    title: t("reports.tables.requestTimes"),
    note: t("reports.notes.requestTimes"),
    columns: [
      { label: t("reports.columns.stage"), kind: "text" },
      { label: t("reports.columns.cases"), kind: "int" },
      { label: t("reports.columns.medianHours"), kind: "dec" },
      { label: t("reports.columns.avgHours"), kind: "dec" },
    ],
    rows,
  };
}

async function orderTimes(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  // Fecha de cada hito por pedido (el primero de cada tipo).
  const pairs = [
    ["toDeposit", "created", "deposit_received"],
    ["toProduction", "deposit_received", "production_started"],
    ["toShipped", "production_started", "shipped"],
    ["toDelivered", "shipped", "delivered"],
    ["orderTotal", "created", "delivered"],
  ] as const;
  const rows: CsvValue[][] = [];
  for (const [key, a, b] of pairs) {
    const [s] = await tx<Stat[]>`
      with m as (
        select o.id, o.created_at as created,
               min(x.occurred_at) filter (where x.type = 'deposit_received') as deposit_received,
               min(x.occurred_at) filter (where x.type = 'production_started') as production_started,
               min(x.occurred_at) filter (where x.type = 'shipped') as shipped,
               min(x.occurred_at) filter (where x.type = 'delivered') as delivered
          from public.orders o
          join public.quote_requests r on r.id = o.request_id
          left join public.milestones x on x.order_id = o.id
         where ${inRange(tx, "r.submitted_at", range)}
         group by o.id, o.created_at
      )
      select count(*)::int as n,
             percentile_cont(0.5) within group (order by extract(epoch from (${tx(b)} - ${tx(a)})) / 86400) as median,
             avg(extract(epoch from (${tx(b)} - ${tx(a)})) / 86400) as avg
        from m where ${tx(a)} is not null and ${tx(b)} is not null and ${tx(b)} >= ${tx(a)}`;
    rows.push([t(`reports.stages.${key}`), s?.n ?? 0, round1(s?.median === null ? null : Number(s?.median)), round1(s?.avg === null ? null : Number(s?.avg))]);
  }
  return {
    key: "orderTimes",
    title: t("reports.tables.orderTimes"),
    note: null,
    columns: [
      { label: t("reports.columns.stage"), kind: "text" },
      { label: t("reports.columns.cases"), kind: "int" },
      { label: t("reports.columns.medianDays"), kind: "dec" },
      { label: t("reports.columns.avgDays"), kind: "dec" },
    ],
    rows,
  };
}

async function conversion(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  const rows = await tx<{ segment: string; n: number; quoted: number; accepted: number }[]>`
    select segment, count(*)::int as n,
           count(*) filter (where quoted_at is not null)::int as quoted,
           count(*) filter (where accepted_at is not null)::int as accepted
      from public.quote_requests r where ${inRange(tx, "r.submitted_at", range)} and status <> 'draft'
     group by segment`;
  const line = (label: string, n: number, quoted: number, accepted: number): CsvValue[] => [label, n, quoted, accepted, pct(quoted, n), pct(accepted, quoted), pct(accepted, n)];
  const sum = (k: "n" | "quoted" | "accepted") => rows.reduce((s, r) => s + r[k], 0);
  return {
    key: "conversion",
    title: t("reports.tables.conversion"),
    note: null,
    columns: [
      { label: t("reports.columns.segment"), kind: "text" },
      { label: t("reports.columns.requests"), kind: "int" },
      { label: t("reports.columns.quoted"), kind: "int" },
      { label: t("reports.columns.accepted"), kind: "int" },
      { label: t("reports.columns.quotedPct"), kind: "pct" },
      { label: t("reports.columns.acceptedOfQuotedPct"), kind: "pct" },
      { label: t("reports.columns.acceptedPct"), kind: "pct" },
    ],
    rows: [
      ...(["commercial", "food", "unsure"] as const).map((s) => {
        const r = rows.find((x) => x.segment === s);
        return line(t(`segments.${s}`), r?.n ?? 0, r?.quoted ?? 0, r?.accepted ?? 0);
      }),
      line(t("reports.all"), sum("n"), sum("quoted"), sum("accepted")),
    ],
  };
}

async function topBy(tx: Tx, range: ReportRange, t: T, field: "type" | "paper"): Promise<ReportTable> {
  const rows = await tx<{ code: string | null; name: string | null; pieces: number; accepted: number }[]>`
    select i.spec_snapshot -> ${field} ->> 'code' as code, i.spec_snapshot -> ${field} ->> 'name' as name,
           count(*)::int as pieces, count(*) filter (where r.accepted_at is not null)::int as accepted
      from public.quote_items i join public.quote_requests r on r.id = i.request_id
     where ${inRange(tx, "r.submitted_at", range)}
     group by 1, 2
     order by pieces desc, accepted desc, name nulls last
     limit 15`;
  const isType = field === "type";
  return {
    key: isType ? "types" : "materials",
    title: t(isType ? "reports.tables.types" : "reports.tables.materials"),
    note: null,
    columns: [
      { label: t("reports.columns.code"), kind: "text" },
      { label: t(isType ? "reports.columns.type" : "reports.columns.material"), kind: "text" },
      { label: t("reports.columns.pieces"), kind: "int" },
      { label: t("reports.columns.piecesAccepted"), kind: "int" },
    ],
    rows: rows.map((r) => [r.code ?? "", r.name ?? t("reports.advice"), r.pieces, r.accepted]),
  };
}

async function losses(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  const rows = await tx<{ reason: string; n: number }[]>`
    select loss_reason as reason, count(*)::int as n from public.quote_requests r
     where ${inRange(tx, "r.submitted_at", range)} and status = 'rejected' and loss_reason is not null group by loss_reason`;
  const total = rows.reduce((s, r) => s + r.n, 0);
  return {
    key: "losses",
    title: t("reports.tables.losses"),
    note: null,
    columns: [
      { label: t("reports.columns.reason"), kind: "text" },
      { label: t("reports.columns.requests"), kind: "int" },
      { label: t("reports.columns.share"), kind: "pct" },
    ],
    rows: (["price", "lead_time", "specification", "no_response", "other"] as const).map((k) => {
      const n = rows.find((r) => r.reason === k)?.n ?? 0;
      return [t(`lossReasons.${k}`), n, pct(n, total)];
    }),
  };
}

async function ordersDue(tx: Tx, t: T, today: string): Promise<ReportTable> {
  const limit = addDays(new Date(`${today}T12:00:00Z`), 14).toISOString().slice(0, 10);
  const rows = await tx<{ number: string; company: string; status: string; due: string }[]>`
    select o.number, coalesce(r.company_name, r.contact_name) as company, o.status,
           to_char(coalesce(o.eta, o.estimated_delivery_date), 'YYYY-MM-DD') as due
      from public.orders o join public.quote_requests r on r.id = o.request_id
     where o.status not in ('delivered', 'closed') and coalesce(o.eta, o.estimated_delivery_date) <= ${limit}::date
     order by coalesce(o.eta, o.estimated_delivery_date), o.number`;
  const days = (due: string) => Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return {
    key: "ordersDue",
    title: t("reports.tables.ordersDue"),
    note: null,
    columns: [
      { label: t("reports.columns.order"), kind: "text" },
      { label: t("reports.columns.client"), kind: "text" },
      { label: t("reports.columns.status"), kind: "text" },
      { label: t("reports.columns.dueDate"), kind: "date" },
      { label: t("reports.columns.daysLeft"), kind: "int" },
    ],
    rows: rows.map((r) => [r.number, r.company, t(`order.statuses.${r.status as "qa"}`), r.due, days(r.due)]),
  };
}

async function channels(tx: Tx, range: ReportRange, t: T): Promise<ReportTable> {
  const rows = await tx<{ source: string | null; lead: string | null; medium: string | null; n: number; accepted: number }[]>`
    select nullif(lower(trim(r.utm ->> 'utm_source')), '') as source, r.lead_source as lead, nullif(lower(trim(r.utm ->> 'utm_medium')), '') as medium,
           count(*)::int as n, count(*) filter (where r.accepted_at is not null)::int as accepted
      from public.quote_requests r where ${inRange(tx, "r.submitted_at", range)} and status <> 'draft'
     group by 1, 2, 3`;
  const tw = serverT("wizard");
  const merged = new Map<string, { channel: string; medium: string; n: number; accepted: number }>();
  for (const r of rows) {
    const channel = r.source ?? (r.lead && tw.has(`sourceOptions.${r.lead}` as never) ? tw(`sourceOptions.${r.lead}` as "sourceOptions.other") : t("reports.direct"));
    const medium = r.source ? (r.medium ?? "") : "";
    const key = `${channel}\u0000${medium}`;
    const prev = merged.get(key) ?? { channel, medium, n: 0, accepted: 0 };
    merged.set(key, { ...prev, n: prev.n + r.n, accepted: prev.accepted + r.accepted });
  }
  return {
    key: "channels",
    title: t("reports.tables.channels"),
    note: t("reports.notes.channels"),
    columns: [
      { label: t("reports.columns.channel"), kind: "text" },
      { label: t("reports.columns.medium"), kind: "text" },
      { label: t("reports.columns.requests"), kind: "int" },
      { label: t("reports.columns.accepted"), kind: "int" },
    ],
    rows: [...merged.values()].sort((a, b) => b.n - a.n || a.channel.localeCompare(b.channel, "es")).map((r) => [r.channel, r.medium, r.n, r.accepted]),
  };
}

/** Un reporte o todos, con los permisos del usuario (RLS). */
export async function getReports(user: CurrentUser, range: ReportRange, only?: ReportKey): Promise<ReportTable[]> {
  const t = serverT("admin");
  const today = todayInPanama();
  const builders: Record<ReportKey, (tx: Tx) => Promise<ReportTable>> = {
    pipeline: (tx) => pipeline(tx, range, t),
    requestTimes: (tx) => requestTimes(tx, range, t),
    orderTimes: (tx) => orderTimes(tx, range, t),
    conversion: (tx) => conversion(tx, range, t),
    types: (tx) => topBy(tx, range, t, "type"),
    materials: (tx) => topBy(tx, range, t, "paper"),
    losses: (tx) => losses(tx, range, t),
    ordersDue: (tx) => ordersDue(tx, t, today),
    channels: (tx) => channels(tx, range, t),
  };
  const keys = only ? [only] : [...REPORT_KEYS];
  return withActor(actorFor(user), async (tx) => {
    const out: ReportTable[] = [];
    for (const k of keys) out.push(await builders[k](tx));
    return out;
  });
}
