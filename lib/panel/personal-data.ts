import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import { log } from "@/lib/log";
import { isValidEmail, normalizeWhatsapp } from "@/lib/quote/validate";
import { removeObject } from "@/lib/storage";

/**
 * Derechos del titular de los datos (Ley 81 de 2019; PRD §15; M17): buscar
 * por correo o WhatsApp, exportar todo lo que tenemos de esa persona y
 * anonimizar una solicitud. Solo admin.
 */
const UUID = /^[0-9a-f-]{36}$/i;

function isAdmin(user: CurrentUser): boolean {
  return user.isActive && user.role === "admin";
}

/** Correo o WhatsApp tal como se guardan. */
function identify(q: string): { email: string | null; whatsapp: string | null } | null {
  const text = q.trim();
  if (isValidEmail(text)) return { email: text.toLowerCase(), whatsapp: null };
  const whatsapp = normalizeWhatsapp(text);
  return whatsapp ? { email: null, whatsapp } : null;
}

export type PersonalMatch = { id: string; number: string; status: string; submittedAt: Date; contactName: string; companyName: string | null };

export async function searchPersonalData(user: CurrentUser, q: string): Promise<PersonalMatch[] | null> {
  if (!isAdmin(user)) return null;
  const who = identify(q);
  if (!who) return [];
  const rows = await withActor(actorFor(user), (tx) => tx<
    { id: string; number: string; status: string; submitted_at: Date; contact_name: string; company_name: string | null }[]
  >`
    select id, number, status, submitted_at, contact_name, company_name from public.quote_requests
     where (${who.email}::text is not null and lower(contact_email) = ${who.email})
        or (${who.whatsapp}::text is not null and contact_whatsapp = ${who.whatsapp})
     order by submitted_at desc`);
  return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, submittedAt: r.submitted_at, contactName: r.contact_name, companyName: r.company_name }));
}

/** Todo lo que guardamos de esa persona, para entregárselo (derecho de acceso). */
export async function exportPersonalData(user: CurrentUser, q: string): Promise<Record<string, unknown> | null> {
  if (!isAdmin(user)) return null;
  const who = identify(q);
  if (!who) return null;
  return withActor(serviceActor, async (tx) => {
    const requests = await tx`
      select id, number, status, segment, submitted_at, company_name, ruc, contact_name, contact_position, contact_email, contact_whatsapp,
             delivery_city, delivery_address, desired_date, comments, lead_source, consent_at, consent_ip
        from public.quote_requests
       where (${who.email}::text is not null and lower(contact_email) = ${who.email})
          or (${who.whatsapp}::text is not null and contact_whatsapp = ${who.whatsapp})
       order by submitted_at`;
    const ids = requests.map((r) => r.id as string);
    if (!ids.length) return { consulta: q.trim(), generado: new Date().toISOString(), solicitudes: [] };
    const items = await tx`select request_id, position, spec_snapshot from public.quote_items where request_id = any(${ids}::uuid[]) order by request_id, position`;
    const quotes = await tx`
      select request_id, number, status, sent_at, accepted_at, accepted_by_name, accepted_by_email, accepted_ip, accepted_channel
        from public.quotes where request_id = any(${ids}::uuid[]) and status <> 'draft' order by request_id, version`;
    const orders = await tx`
      select request_id, number, status, currency, total_amount, deposit_amount, balance_amount, delivery_city, delivery_address, delivered_at, closed_at
        from public.orders where request_id = any(${ids}::uuid[])`;
    const payments = await tx`
      select o.number as pedido, p.kind, p.status, p.amount, p.paid_on, p.method, p.reference
        from public.payments p join public.orders o on o.id = p.order_id where o.request_id = any(${ids}::uuid[])`;
    const files = await tx`select request_id, kind, version, file_name, created_at from public.artwork_files where request_id = any(${ids}::uuid[]) and deleted_at is null`;
    const approvals = await tx`select request_id, approved_at, approved_by_name, approved_by_email, ip from public.artwork_approvals where request_id = any(${ids}::uuid[])`;
    const notifications = await tx`
      select request_id, template_code, channel, recipient, status, created_at from public.notifications
       where request_id = any(${ids}::uuid[]) and audience = 'client' order by created_at`;
    const surveys = await tx`select request_id, score, comment, created_at from public.surveys where request_id = any(${ids}::uuid[])`;
    return {
      consulta: q.trim(),
      generado: new Date().toISOString(),
      solicitudes: requests,
      piezas: items,
      cotizaciones: quotes,
      pedidos: orders,
      pagos: payments,
      archivos: files,
      aprobaciones_de_proof: approvals,
      avisos_enviados: notifications,
      encuestas: surveys,
    };
  });
}

export type AnonymizeResult = { ok: true; files: number; converted: boolean } | { ok: false; error: "forbidden" | "not_found" | "confirm" };

type AnonymizeOutcome = { converted: boolean; drafts: number; artwork: string[]; documents: string[] };

/**
 * Anonimiza una solicitud (derecho de eliminación; D-116). Pide escribir el
 * número de la solicitud como confirmación. No se puede deshacer. Siempre se
 * anonimiza el contacto y se borran los borradores; si la solicitud no llegó
 * a pedido, también su arte, sus referencias y los PDF de cotizaciones no
 * aceptadas. Si llegó a pedido, se conservan la cotización aceptada, el pedido,
 * los pagos y el arte, que siguen la retención de D-115.
 */
export async function anonymizeRequest(user: CurrentUser, requestId: string, confirmNumber: string): Promise<AnonymizeResult> {
  if (!isAdmin(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(requestId)) return { ok: false, error: "not_found" };
  const outcome = await withActor(actorFor(user), async (tx) => {
    const [r] = await tx<{ number: string }[]>`select number from public.quote_requests where id = ${requestId}`;
    if (!r) return null;
    if (r.number !== confirmNumber.trim().toUpperCase()) return "confirm" as const;
    const [row] = await tx<{ outcome: AnonymizeOutcome }[]>`select public.anonymize_request(${requestId}) as outcome`;
    return row?.outcome ?? { converted: false, drafts: 0, artwork: [], documents: [] };
  });
  if (outcome === null) return { ok: false, error: "not_found" };
  if (outcome === "confirm") return { ok: false, error: "confirm" };
  let files = 0;
  const targets = [
    ...outcome.artwork.map((path) => ["artwork", path] as const),
    ...outcome.documents.map((path) => ["documents", path] as const),
  ];
  for (const [bucket, path] of targets) {
    try {
      await removeObject(bucket, path);
      files += 1;
    } catch (error) {
      log.error("no se pudo borrar un archivo al anonimizar", { error });
    }
  }
  return { ok: true, files, converted: outcome.converted };
}
