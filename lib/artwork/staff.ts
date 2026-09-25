import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";
import { signedUrl } from "@/lib/storage";
import { canStaffMoveArtwork, checklistComplete, checklistObservations, CHECKLIST_KEYS, type ArtworkStatus, type Checklist, type ChecklistResult } from "./states";

/**
 * Arte visto por el equipo (PRD §9, revisión manual con checklist). Todo el
 * equipo ve que hay archivos; abrirlos, revisarlos y subir proofs es solo para
 * el equipo asignado a la solicitud y admin (`can_access_request_files`).
 */
export type StaffArtworkFile = {
  id: string;
  itemId: string;
  kind: "artwork" | "proof";
  version: number;
  fileName: string;
  format: string;
  sizeBytes: number;
  status: ArtworkStatus;
  checklist: Checklist;
  comments: string | null;
  uploadedByClient: boolean;
  reviewedAt: Date | null;
  createdAt: Date;
  approval: { approvedAt: Date; name: string; email: string | null; ip: string | null } | null;
};

export type StaffArtwork = { canOpen: boolean; files: StaffArtworkFile[] };

const UUID = /^[0-9a-f-]{36}$/i;

export async function listRequestArtwork(user: CurrentUser, requestId: string): Promise<StaffArtwork> {
  if (!UUID.test(requestId)) return { canOpen: false, files: [] };
  return withActor(actorFor(user), async (tx) => {
    const [access] = await tx<{ ok: boolean }[]>`select public.can_access_request_files(${requestId}::uuid) as ok`;
    const rows = await tx<
      {
        id: string;
        item_id: string;
        kind: "artwork" | "proof";
        version: number;
        file_name: string;
        format: string;
        size_bytes: string;
        status: ArtworkStatus;
        checklist: Checklist;
        comments: string | null;
        uploaded_by_client: boolean;
        reviewed_at: Date | null;
        created_at: Date;
        approved_at: Date | null;
        approved_by_name: string | null;
        approved_by_email: string | null;
        ip: string | null;
      }[]
    >`
      select f.id, f.item_id, f.kind, f.version, f.file_name, f.format, f.size_bytes, f.status, f.checklist, f.comments,
             f.uploaded_by_client, f.reviewed_at, f.created_at,
             a.approved_at, a.approved_by_name, a.approved_by_email, a.ip
        from public.artwork_files f
        left join public.artwork_approvals a on a.artwork_file_id = f.id
       where f.request_id = ${requestId} and f.deleted_at is null
       order by f.item_id, f.kind, f.version desc`;
    return {
      canOpen: Boolean(access?.ok),
      files: rows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        kind: r.kind,
        version: r.version,
        fileName: r.file_name,
        format: r.format,
        sizeBytes: Number(r.size_bytes),
        status: r.status,
        checklist: r.checklist ?? {},
        comments: r.comments,
        uploadedByClient: r.uploaded_by_client,
        reviewedAt: r.reviewed_at,
        createdAt: r.created_at,
        approval: r.approved_at ? { approvedAt: r.approved_at, name: r.approved_by_name ?? "", email: r.approved_by_email, ip: r.ip } : null,
      })),
    };
  });
}

/** URL firmada (5 min) solo para el equipo asignado y admin. */
export async function staffFileUrl(user: CurrentUser, fileId: string, download = false): Promise<string | null> {
  if (!UUID.test(fileId)) return null;
  const rows = await withActor(actorFor(user), (tx) => tx<{ storage_path: string; file_name: string; ok: boolean }[]>`
    select storage_path, file_name, public.can_access_request_files(request_id) as ok
      from public.artwork_files where id = ${fileId} and deleted_at is null`);
  const f = rows[0];
  if (!f?.ok) return null;
  return signedUrl("artwork", f.storage_path, { expiresIn: 300, downloadName: download ? f.file_name : undefined });
}

export type ReviewInput = { status: ArtworkStatus; checklist: Checklist; comments: string };
export type ReviewResult = { ok: true } | { ok: false; error: "forbidden" | "transition" | "checklist" | "observations" };

/** Sanea el checklist que llega del formulario (solo claves y resultados conocidos). */
export function cleanChecklist(input: unknown): Checklist {
  const out: Checklist = {};
  if (!input || typeof input !== "object") return out;
  for (const key of CHECKLIST_KEYS) {
    const value = (input as Record<string, { result?: unknown; note?: unknown }>)[key];
    const result = value?.result;
    if (result === "ok" || result === "observed" || result === "na") {
      const note = typeof value?.note === "string" ? value.note.trim().slice(0, 500) : "";
      out[key] = note ? { result: result as ChecklistResult, note } : { result: result as ChecklistResult };
    }
  }
  return out;
}

/**
 * Guarda la revisión de una versión de arte: checklist, comentarios y cambio
 * de estado. "Aprobado para proof" exige el checklist completo sin
 * observaciones; "Observado" exige al menos un punto observado o un comentario.
 */
export async function reviewArtwork(user: CurrentUser, fileId: string, input: ReviewInput): Promise<ReviewResult> {
  if (!UUID.test(fileId)) return { ok: false, error: "forbidden" };
  const checklist = cleanChecklist(input.checklist);
  const comments = input.comments.trim().slice(0, 4000) || null;
  return withActor(actorFor(user), async (tx) => {
    const [file] = await tx<{ id: string; request_id: string; item_id: string; kind: string; status: ArtworkStatus; ok: boolean }[]>`
      select id, request_id, item_id, kind, status, public.can_access_request_files(request_id) and public.is_staff_editor() as ok
        from public.artwork_files where id = ${fileId} and deleted_at is null for update`;
    if (!file?.ok || file.kind !== "artwork") return { ok: false, error: "forbidden" } as const;
    if (input.status !== file.status && !canStaffMoveArtwork(file.status, input.status)) return { ok: false, error: "transition" } as const;
    if (input.status === "approved_for_proof" && !checklistComplete(checklist)) return { ok: false, error: "checklist" } as const;
    if (input.status === "observed" && checklistObservations(checklist).length === 0 && !comments) return { ok: false, error: "observations" } as const;
    await tx`
      update public.artwork_files
         set status = ${input.status}, checklist = ${tx.json(checklist as never)}, comments = ${comments},
             reviewed_by = ${user.userId}, reviewed_at = now()
       where id = ${fileId}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body, payload)
      values (${file.request_id}, 'artwork_file', ${fileId}, ${user.userId}, 'system', 'artwork_reviewed', ${input.status},
              ${tx.json({ from: file.status, to: input.status, observed: checklistObservations(checklist) })})`;
    return { ok: true } as const;
  });
}

/** Libera a fábrica un proof aprobado por el cliente. */
export async function releaseProof(user: CurrentUser, fileId: string): Promise<ReviewResult> {
  if (!UUID.test(fileId)) return { ok: false, error: "forbidden" };
  return withActor(actorFor(user), async (tx) => {
    const [file] = await tx<{ request_id: string; kind: string; status: ArtworkStatus; ok: boolean }[]>`
      select request_id, kind, status, public.can_access_request_files(request_id) and public.is_staff_editor() as ok
        from public.artwork_files where id = ${fileId} and deleted_at is null for update`;
    if (!file?.ok || file.kind !== "proof") return { ok: false, error: "forbidden" } as const;
    if (!canStaffMoveArtwork(file.status, "released")) return { ok: false, error: "transition" } as const;
    await tx`update public.artwork_files set status = 'released', reviewed_by = ${user.userId}, reviewed_at = now() where id = ${fileId}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${file.request_id}, 'artwork_file', ${fileId}, ${user.userId}, 'system', 'artwork_released', 'released')`;
    return { ok: true } as const;
  });
}

/** ¿Se puede subir un proof para esta pieza? (hay una versión de arte aprobada para proof). */
export async function canUploadProof(user: CurrentUser, requestId: string, itemId: string): Promise<boolean> {
  if (!UUID.test(requestId) || !UUID.test(itemId)) return false;
  const rows = await withActor(actorFor(user), (tx) => tx<{ ok: boolean }[]>`
    select public.can_access_request_files(${requestId}::uuid) and public.is_staff_editor() and exists (
      select 1 from public.artwork_files
       where request_id = ${requestId}::uuid and item_id = ${itemId}::uuid and kind = 'artwork'
         and status = 'approved_for_proof' and deleted_at is null) as ok`);
  return Boolean(rows[0]?.ok);
}
