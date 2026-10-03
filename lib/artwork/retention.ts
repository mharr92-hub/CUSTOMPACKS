import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import { log } from "@/lib/log";
import { removeObject } from "@/lib/storage";

/**
 * Retención de archivos (PRD §9; D-115). El cron solo MARCA lo vencido; se
 * borra únicamente cuando admin lo confirma en /admin/archivos.
 * - Arte y proofs (`artwork_retention_months`, 24): si la solicitud llegó a
 *   pedido, desde el cierre del pedido (y solo cuando todos sus pedidos están
 *   cerrados); si no, desde su última actividad (último cambio de estado o
 *   último archivo subido).
 * - Fotos y videos de hitos y QA (`evidence_retention_months`, 24): desde el
 *   cierre del pedido.
 * - Comprobantes de pago, PDF de cotizaciones y constancias de aceptación
 *   (`legal_documents_retention_years`, 5): desde el cierre del pedido.
 */
/** Plazos vigentes, para la política de privacidad. */
export async function retentionPeriods(): Promise<{ artworkMonths: number; evidenceMonths: number; legalYears: number }> {
  const [row] = await withActor(serviceActor, (tx) => tx<{ artwork: number; evidence: number; legal: number }[]>`
    select coalesce((select (value #>> '{}')::int from public.settings where key = 'artwork_retention_months'), 24) as artwork,
           coalesce((select (value #>> '{}')::int from public.settings where key = 'evidence_retention_months'), 24) as evidence,
           coalesce((select (value #>> '{}')::int from public.settings where key = 'legal_documents_retention_years'), 5) as legal`);
  return { artworkMonths: row?.artwork ?? 24, evidenceMonths: row?.evidence ?? 24, legalYears: row?.legal ?? 5 };
}

export async function flagExpiredArtwork(): Promise<number> {
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`
    with cfg as (
      select coalesce((select (value #>> '{}')::int from public.settings where key = 'artwork_retention_months'), 24) as months
    ),
    since as (
      select r.id as request_id,
             case
               when exists (select 1 from public.orders o where o.request_id = r.id) then
                 (select case when bool_and(o.status = 'closed') then max(o.closed_at) end from public.orders o where o.request_id = r.id)
               else greatest(
                 r.submitted_at,
                 r.status_changed_at,
                 coalesce((select max(f.created_at) from public.artwork_files f where f.request_id = r.id), r.submitted_at))
             end as at
        from public.quote_requests r
    )
    update public.artwork_files f
       set retention_flagged_at = now()
      from since s, cfg
     where s.request_id = f.request_id
       and f.retention_flagged_at is null
       and f.deleted_at is null
       and s.at is not null
       and s.at < now() - make_interval(months => cfg.months)
    returning f.id`);
  return rows.length;
}

/** Marca evidencias, comprobantes, PDF de cotizaciones y constancias vencidos (D-115). */
export async function flagExpiredRecords(): Promise<number> {
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`
    with cfg as (
      select coalesce((select (value #>> '{}')::int from public.settings where key = 'evidence_retention_months'), 24) as evidence_months,
             coalesce((select (value #>> '{}')::int from public.settings where key = 'legal_documents_retention_years'), 5) as legal_years
    ),
    closed as (
      select o.id, o.request_id,
             o.closed_at < now() - make_interval(months => cfg.evidence_months) as evidence_due,
             o.closed_at < now() - make_interval(years => cfg.legal_years) as legal_due
        from public.orders o, cfg
       where o.status = 'closed' and o.closed_at is not null
    ),
    due as (
      select 'evidence' as kind, 'evidence' as bucket, e->>'path' as storage_path, c.request_id, c.id as order_id, m.id as source_id, e->>'name' as file_name
        from closed c join public.milestones m on m.order_id = c.id cross join lateral jsonb_array_elements(m.evidence) e
       where c.evidence_due and e->>'path' is not null
      union all
      select 'receipt', 'documents', p.receipt_path, c.request_id, c.id, p.id, null
        from closed c join public.payments p on p.order_id = c.id
       where c.legal_due and p.receipt_path is not null
      union all
      select 'quote_pdf', 'documents', q.pdf_path, c.request_id, c.id, q.id, q.number
        from closed c join public.quotes q on q.request_id = c.request_id
       where c.legal_due and q.pdf_path is not null
      union all
      select 'acceptance', 'documents', q.accepted_evidence_path, c.request_id, c.id, q.id, q.number
        from closed c join public.quotes q on q.request_id = c.request_id
       where c.legal_due and q.accepted_evidence_path is not null
    )
    insert into public.retention_items (kind, bucket, storage_path, request_id, order_id, source_id, file_name)
    select kind, bucket, storage_path, request_id, order_id, source_id, file_name from due
    on conflict (storage_path) do nothing
    returning id`);
  return rows.length;
}

export type FlaggedFile = {
  id: string;
  requestId: string;
  requestNumber: string;
  fileName: string;
  kind: "artwork" | "proof";
  version: number;
  sizeBytes: number;
  flaggedAt: Date;
};

export async function listFlaggedArtwork(user: CurrentUser): Promise<FlaggedFile[]> {
  const rows = await withActor(actorFor(user), (tx) => tx<
    { id: string; request_id: string; number: string; file_name: string; kind: "artwork" | "proof"; version: number; size_bytes: string; retention_flagged_at: Date }[]
  >`
    select f.id, f.request_id, r.number, f.file_name, f.kind, f.version, f.size_bytes, f.retention_flagged_at
      from public.artwork_files f join public.quote_requests r on r.id = f.request_id
     where f.retention_flagged_at is not null and f.deleted_at is null and public.is_admin()
     order by f.retention_flagged_at, r.number, f.kind, f.version`);
  return rows.map((r) => ({
    id: r.id,
    requestId: r.request_id,
    requestNumber: r.number,
    fileName: r.file_name,
    kind: r.kind,
    version: r.version,
    sizeBytes: Number(r.size_bytes),
    flaggedAt: r.retention_flagged_at,
  }));
}

/**
 * Admin confirma el borrado: se elimina el archivo del almacenamiento y la
 * fila queda como registro (fecha y quién), junto con la aprobación del proof.
 */
export async function confirmArtworkDeletion(user: CurrentUser, fileIds: readonly string[]): Promise<number> {
  const ids = fileIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500);
  if (ids.length === 0) return 0;
  const files = await withActor(actorFor(user), (tx) => tx<{ id: string; request_id: string; storage_path: string }[]>`
    select id, request_id, storage_path from public.artwork_files
     where id = any(${ids}::uuid[]) and retention_flagged_at is not null and deleted_at is null and public.is_admin()`);
  let deleted = 0;
  for (const f of files) {
    try {
      await removeObject("artwork", f.storage_path);
    } catch (error) {
      log.error("no se pudo borrar un archivo de arte vencido", { error, id: f.id });
      continue;
    }
    await withActor(actorFor(user), async (tx) => {
      await tx`update public.artwork_files set deleted_at = now(), deleted_by = ${user.userId} where id = ${f.id}`;
      await tx`
        insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
        values (${f.request_id}, 'artwork_file', ${f.id}, ${user.userId}, 'system', 'artwork_deleted', 'retention')`;
    });
    deleted += 1;
  }
  return deleted;
}

export type FlaggedRecord = {
  id: string;
  kind: "evidence" | "receipt" | "quote_pdf" | "acceptance";
  requestId: string | null;
  requestNumber: string | null;
  fileName: string | null;
  flaggedAt: Date;
};

export async function listFlaggedRecords(user: CurrentUser): Promise<FlaggedRecord[]> {
  const rows = await withActor(actorFor(user), (tx) => tx<
    { id: string; kind: FlaggedRecord["kind"]; request_id: string | null; number: string | null; file_name: string | null; flagged_at: Date }[]
  >`
    select i.id, i.kind, i.request_id, r.number, i.file_name, i.flagged_at
      from public.retention_items i left join public.quote_requests r on r.id = i.request_id
     where i.deleted_at is null and public.is_admin()
     order by i.flagged_at, r.number, i.kind`);
  return rows.map((r) => ({ id: r.id, kind: r.kind, requestId: r.request_id, requestNumber: r.number, fileName: r.file_name, flaggedAt: r.flagged_at }));
}

/**
 * Admin confirma el borrado de evidencias y documentos vencidos: se elimina el
 * archivo y se quita su referencia de la fila de origen (el hito, el pago o la
 * cotización), que se conserva con sus montos y fechas.
 */
export async function confirmRecordDeletion(user: CurrentUser, itemIds: readonly string[]): Promise<number> {
  const ids = itemIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500);
  if (ids.length === 0) return 0;
  const items = await withActor(actorFor(user), (tx) => tx<
    { id: string; kind: FlaggedRecord["kind"]; bucket: "evidence" | "documents"; storage_path: string; request_id: string | null; source_id: string }[]
  >`
    select id, kind, bucket, storage_path, request_id, source_id from public.retention_items
     where id = any(${ids}::uuid[]) and deleted_at is null and public.is_admin()`);
  let deleted = 0;
  for (const item of items) {
    try {
      await removeObject(item.bucket, item.storage_path);
    } catch (error) {
      log.error("no se pudo borrar un archivo vencido", { error, id: item.id });
      continue;
    }
    // Pagos y cotizaciones no admiten escritura del rol del panel: se
    // actualizan con el servicio, después de verificar arriba que es admin.
    await withActor(serviceActor, async (tx) => {
      if (item.kind === "evidence") {
        await tx`
          update public.milestones
             set evidence = coalesce((select jsonb_agg(e) from jsonb_array_elements(evidence) e where e->>'path' <> ${item.storage_path}), '[]'::jsonb)
           where id = ${item.source_id}`;
      } else if (item.kind === "receipt") {
        await tx`update public.payments set receipt_path = null where id = ${item.source_id} and receipt_path = ${item.storage_path}`;
      } else if (item.kind === "quote_pdf") {
        await tx`update public.quotes set pdf_path = null where id = ${item.source_id} and pdf_path = ${item.storage_path}`;
      } else {
        await tx`update public.quotes set accepted_evidence_path = null where id = ${item.source_id} and accepted_evidence_path = ${item.storage_path}`;
      }
      await tx`update public.retention_items set deleted_at = now(), deleted_by = ${user.userId}, updated_by = ${user.userId} where id = ${item.id}`;
      await tx`
        insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
        values (${item.request_id}, ${item.kind}, ${item.source_id}, ${user.userId}, 'system', 'file_deleted', 'retention')`;
    });
    deleted += 1;
  }
  return deleted;
}
