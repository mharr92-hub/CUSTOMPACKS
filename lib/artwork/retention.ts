import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import { log } from "@/lib/log";
import { removeObject } from "@/lib/storage";

/**
 * Retención del arte (PRD §9: 24 meses propuesta, `artwork_retention_months`).
 * El cron solo MARCA los archivos vencidos; se borran únicamente cuando admin
 * lo confirma. La última actividad es lo más reciente entre el último cambio
 * de estado de la solicitud, el último archivo subido y el último movimiento
 * de su pedido (hito, entrega o cierre).
 */
export async function artworkRetentionMonths(): Promise<number> {
  const [row] = await withActor(serviceActor, (tx) => tx<{ months: number }[]>`
    select coalesce((select (value #>> '{}')::int from public.settings where key = 'artwork_retention_months'), 24) as months`);
  return row?.months ?? 24;
}

export async function flagExpiredArtwork(): Promise<number> {
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`
    with cfg as (
      select coalesce((select (value #>> '{}')::int from public.settings where key = 'artwork_retention_months'), 24) as months
    ),
    last_activity as (
      select r.id as request_id,
             greatest(
               r.submitted_at,
               r.status_changed_at,
               coalesce((select max(f.created_at) from public.artwork_files f where f.request_id = r.id), r.submitted_at),
               coalesce((select max(greatest(o.status_changed_at, coalesce(o.closed_at, o.status_changed_at))) from public.orders o where o.request_id = r.id), r.submitted_at),
               coalesce((select max(m.occurred_at) from public.milestones m join public.orders o on o.id = m.order_id where o.request_id = r.id), r.submitted_at)
             ) as at
        from public.quote_requests r
    )
    update public.artwork_files f
       set retention_flagged_at = now()
      from last_activity la, cfg
     where la.request_id = f.request_id
       and f.retention_flagged_at is null
       and f.deleted_at is null
       and la.at < now() - make_interval(months => cfg.months)
    returning f.id`);
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
