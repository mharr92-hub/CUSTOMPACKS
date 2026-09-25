import "server-only";
import { brand } from "@/config/brand";
import { actorFor, EDITOR_ROLES, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import { getServerEnv } from "@/lib/env";
import { serverT } from "@/lib/i18n";
import { log } from "@/lib/log";
import { escapeHtml, sendEmail } from "@/lib/mail";
import { getRequestDetail } from "@/lib/panel/requests";
import { parseMoney } from "@/lib/quotes/pricing";
import { getObject, putObject, signedUrl } from "@/lib/storage";
import { absoluteUrl } from "@/lib/urls";
import { renderRfqPdf, renderRfqXlsx } from "./documents";
import { rfqRows } from "./rows";

/**
 * RFQ a fábrica (PRD §11): se genera desde la ficha congelada (sin retipear),
 * en PDF y Excel, se envía por correo a FACTORY_EMAIL y se registra la
 * respuesta (costo por cantidad, moneda, tiempo de producción, notas).
 */
const UUID = /^[0-9a-f-]{36}$/i;
const LINK_DAYS = 7;

export type Rfq = {
  id: string;
  requestId: string;
  version: number;
  number: string;
  sentAt: Date | null;
  sentTo: string | null;
  respondedAt: Date | null;
  costs: { itemId: string; quantity: number; unitCost: number }[];
  currency: string;
  productionDays: number | null;
  notes: string | null;
  createdAt: Date;
};

export type RfqResult<T = object> = ({ ok: true } & T) | { ok: false; error: "forbidden" | "not_found" | "status" | "artwork" | "no_factory_email" | "send_failed" | "costs" | "days"; pieces?: number[] };

function isEditor(user: CurrentUser): boolean {
  return user.isActive && EDITOR_ROLES.includes(user.role);
}

type RfqRowDb = {
  id: string;
  request_id: string;
  version: number;
  number: string;
  sent_at: Date | null;
  sent_to: string | null;
  responded_at: Date | null;
  costs: { item_id: string; quantity: number; unit_cost: number }[];
  currency: string;
  production_days: number | null;
  notes: string | null;
  created_at: Date;
  pdf_path: string | null;
  xlsx_path: string | null;
};

const toRfq = (r: RfqRowDb): Rfq => ({
  id: r.id,
  requestId: r.request_id,
  version: r.version,
  number: `${r.number}-v${r.version}`,
  sentAt: r.sent_at,
  sentTo: r.sent_to,
  respondedAt: r.responded_at,
  costs: (r.costs ?? []).map((c) => ({ itemId: c.item_id, quantity: Number(c.quantity), unitCost: Number(c.unit_cost) })),
  currency: r.currency,
  productionDays: r.production_days,
  notes: r.notes,
  createdAt: r.created_at,
});

export async function listRfqs(user: CurrentUser, requestId: string): Promise<Rfq[]> {
  if (!UUID.test(requestId)) return [];
  const rows = await withActor(actorFor(user), (tx) => tx<RfqRowDb[]>`
    select f.*, r.number from public.factory_rfqs f join public.quote_requests r on r.id = f.request_id
     where f.request_id = ${requestId} order by f.version desc`);
  return rows.map(toRfq);
}

async function loadRfq(user: CurrentUser, rfqId: string): Promise<RfqRowDb | null> {
  if (!UUID.test(rfqId)) return null;
  const rows = await withActor(actorFor(user), (tx) => tx<RfqRowDb[]>`
    select f.*, r.number from public.factory_rfqs f join public.quote_requests r on r.id = f.request_id where f.id = ${rfqId}`);
  return rows[0] ?? null;
}

/** Arte de cada pieza para el RFQ: solo viaja el liberado (PRD §11). */
async function artworkByItem(requestId: string): Promise<Map<string, { released: { name: string; path: string }[]; any: boolean }>> {
  const files = await withActor(serviceActor, (tx) => tx<{ item_id: string; status: string; file_name: string; storage_path: string }[]>`
    select item_id, status, file_name, storage_path from public.artwork_files
     where request_id = ${requestId} and deleted_at is null order by kind, version`);
  const map = new Map<string, { released: { name: string; path: string }[]; any: boolean }>();
  for (const f of files) {
    const entry = map.get(f.item_id) ?? { released: [], any: false };
    entry.any = true;
    if (f.status === "released") entry.released.push({ name: f.file_name, path: f.storage_path });
    map.set(f.item_id, entry);
  }
  return map;
}

/**
 * Genera una versión nueva del RFQ. Regla de §14: ninguna pieza con
 * impresión sale sin arte (al menos un archivo cargado).
 */
export async function generateRfq(user: CurrentUser, requestId: string): Promise<RfqResult<{ rfq: Rfq }>> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  const request = await getRequestDetail(user, requestId);
  if (!request) return { ok: false, error: "not_found" };
  if (request.status !== "in_review" && request.status !== "rfq_sent") return { ok: false, error: "status" };
  const t = serverT("rfq");
  const ta = serverT("admin");
  const art = await artworkByItem(requestId);
  const printed = (spec: (typeof request.items)[number]["spec"]) => spec.artwork !== "not_applicable" && !spec.needsAdvice;
  const missing = request.items.filter((i) => printed(i.spec) && !art.get(i.id)?.any).map((i) => i.position);
  if (missing.length) return { ok: false, error: "artwork", pieces: missing };

  const items = request.items.map((i) => {
    const a = art.get(i.id);
    const artwork = !printed(i.spec) ? t("artworkNone") : a?.released.length ? t("artworkReleased", { files: a.released.map((f) => f.name).join(", ") }) : t("artworkPending");
    return { position: i.position, spec: i.spec, artwork };
  });
  const [counter] = await withActor(actorFor(user), (tx) => tx<{ next: number }[]>`
    select coalesce(max(version), 0) + 1 as next from public.factory_rfqs where request_id = ${requestId}`);
  const next = counter?.next ?? 1;
  const rfqNumber = `${request.number}-v${next}`;
  const ts = serverT("spec");
  const input = {
    rfqNumber,
    requestNumber: request.number,
    segment: ta(`segments.${request.segment}`),
    destination: [request.deliveryAddress, request.deliveryCity].filter(Boolean).join(", "),
    desiredDate: request.desiredDate,
    createdAt: new Date(),
    items,
    rows: rfqRows({ number: request.number, items }, (key, values) => ts(key as "none", values as never)),
  };
  const [pdfBuffer, xlsxBuffer] = [await renderRfqPdf(input), renderRfqXlsx(input)];
  const base = `requests/${requestId}/rfq/v${next}/RFQ-${rfqNumber}`;
  await putObject("documents", `${base}.pdf`, pdfBuffer, "application/pdf");
  await putObject("documents", `${base}.xlsx`, xlsxBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const rfq = await withActor(actorFor(user), async (tx) => {
    const [row] = await tx<RfqRowDb[]>`
      insert into public.factory_rfqs (request_id, version, pdf_path, xlsx_path)
      values (${requestId}, ${next}, ${`${base}.pdf`}, ${`${base}.xlsx`})
      returning *, ${request.number}::text as number`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${requestId}, 'factory_rfq', ${row!.id}, ${user.userId}, 'system', 'rfq_generated', ${rfqNumber})`;
    return row!;
  });
  return { ok: true, rfq: toRfq(rfq) };
}

/** Envía el RFQ a la fábrica (PDF y Excel adjuntos, enlaces al arte liberado) y pasa la solicitud a "RFQ enviado". */
export async function sendRfq(user: CurrentUser, rfqId: string): Promise<RfqResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  const rfq = await loadRfq(user, rfqId);
  if (!rfq?.pdf_path || !rfq.xlsx_path) return { ok: false, error: "not_found" };
  const to = getServerEnv().factoryEmail;
  if (!to) return { ok: false, error: "no_factory_email" };
  const t = serverT("rfq");
  const number = `${rfq.number}-v${rfq.version}`;
  const [pdfFile, xlsxFile] = await Promise.all([getObject("documents", rfq.pdf_path), getObject("documents", rfq.xlsx_path)]);
  if (!pdfFile || !xlsxFile) return { ok: false, error: "not_found" };
  const art = await artworkByItem(rfq.request_id);
  const links: string[] = [];
  for (const entry of art.values()) {
    for (const f of entry.released) {
      const url = await signedUrl("artwork", f.path, { expiresIn: LINK_DAYS * 24 * 3600, downloadName: f.name });
      links.push(`${f.name}: ${url.startsWith("/") ? absoluteUrl(url) : url}`);
    }
  }
  const artworkText = links.length ? t("emailArtwork", { links: links.join(" · ") }) : "";
  const text = t("emailText", { number, artwork: artworkText });
  const result = await sendEmail({
    to,
    subject: t("emailSubject", { number, brand: brand.name }),
    text,
    html: `<p>${escapeHtml(text)}</p>`,
    attachments: [
      { filename: `RFQ-${number}.pdf`, content: pdfFile.data, contentType: "application/pdf" },
      { filename: `RFQ-${number}.xlsx`, content: xlsxFile.data, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    ],
  });
  if (result.status === "failed") {
    log.error("RFQ no enviado", { rfqId, error: result.error });
    return { ok: false, error: "send_failed" };
  }
  await withActor(actorFor(user), async (tx) => {
    await tx`update public.factory_rfqs set sent_at = now(), sent_to = ${to} where id = ${rfq.id}`;
    const [req] = await tx<{ status: string }[]>`select status from public.quote_requests where id = ${rfq.request_id} for update`;
    if (req?.status === "in_review") {
      await tx`select set_config('app.transition_reason', ${`RFQ ${number}`}, true)`;
      await tx`update public.quote_requests set status = 'rfq_sent' where id = ${rfq.request_id}`;
    }
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${rfq.request_id}, 'factory_rfq', ${rfq.id}, ${user.userId}, 'email', 'rfq_sent', ${number})`;
  });
  return { ok: true };
}

export type RfqResponseInput = { costs: { itemId: string; quantity: number; unitCost: string }[]; currency: string; productionDays: string; notes: string };

/** Registra la respuesta de la fábrica: costo unitario para cada pieza y cantidad. */
export async function recordRfqResponse(user: CurrentUser, rfqId: string, input: RfqResponseInput): Promise<RfqResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  const rfq = await loadRfq(user, rfqId);
  if (!rfq) return { ok: false, error: "not_found" };
  const request = await getRequestDetail(user, rfq.request_id);
  if (!request) return { ok: false, error: "not_found" };
  const expected = request.items.flatMap((i) => i.spec.quantities.map((q) => `${i.id}:${q}`));
  const costs: { item_id: string; quantity: number; unit_cost: number }[] = [];
  for (const c of input.costs) {
    const value = parseMoney(String(c.unitCost ?? ""));
    if (value === null || value <= 0 || !expected.includes(`${c.itemId}:${c.quantity}`)) return { ok: false, error: "costs" };
    costs.push({ item_id: c.itemId, quantity: Number(c.quantity), unit_cost: value });
  }
  if (costs.length !== expected.length) return { ok: false, error: "costs" };
  const days = input.productionDays.trim() ? Number(input.productionDays) : null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return { ok: false, error: "days" };
  const currency = /^[A-Z]{3}$/.test(input.currency.trim().toUpperCase()) ? input.currency.trim().toUpperCase() : "USD";
  await withActor(actorFor(user), async (tx) => {
    await tx`
      update public.factory_rfqs
         set costs = ${tx.json(costs)}, currency = ${currency}, production_days = ${days}, notes = ${input.notes.trim().slice(0, 4000) || null}, responded_at = now()
       where id = ${rfq.id}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${rfq.request_id}, 'factory_rfq', ${rfq.id}, ${user.userId}, 'system', 'rfq_answered', ${`${rfq.number}-v${rfq.version}`})`;
  });
  return { ok: true };
}

/** URL firmada de un documento del RFQ (solo el equipo). */
export async function rfqFileUrl(user: CurrentUser, rfqId: string, kind: "pdf" | "xlsx"): Promise<string | null> {
  const rfq = await loadRfq(user, rfqId);
  const path = kind === "pdf" ? rfq?.pdf_path : rfq?.xlsx_path;
  if (!rfq || !path) return null;
  return signedUrl("documents", path, { expiresIn: 300, downloadName: path.split("/").pop() });
}
