import "server-only";
import { serviceActor, withActor } from "@/lib/db/actor";
import { getRequestByToken } from "@/lib/quote/tracking";
import { enqueueNotification } from "@/lib/notify";
import { signedUrl } from "@/lib/storage";
import type { ArtworkStatus, Checklist } from "./states";

/**
 * Arte visto desde el portal del cliente (enlace seguro). Todo pasa por el
 * token: solo se ven y firman archivos de SU solicitud.
 */
export type PortalArtworkFile = {
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
  createdAt: Date;
  approval: { approvedAt: Date; name: string } | null;
};

export async function listPortalArtwork(accessToken: string): Promise<PortalArtworkFile[]> {
  return withActor({ kind: "anon", accessToken }, async (tx) => {
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
        created_at: Date;
        approved_at: Date | null;
        approved_by_name: string | null;
      }[]
    >`
      select f.id, f.item_id, f.kind, f.version, f.file_name, f.format, f.size_bytes, f.status, f.checklist, f.comments, f.created_at,
             a.approved_at, a.approved_by_name
        from public.artwork_files f
        left join public.artwork_approvals a on a.artwork_file_id = f.id
       where f.deleted_at is null
       order by f.item_id, f.kind, f.version desc`;
    return rows.map((r) => ({
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
      createdAt: r.created_at,
      approval: r.approved_at ? { approvedAt: r.approved_at, name: r.approved_by_name ?? "" } : null,
    }));
  });
}

/** URL firmada (5 min) de un archivo de la solicitud del cliente. */
export async function portalFileUrl(accessToken: string, fileId: string, download = false): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const rows = await withActor({ kind: "anon", accessToken }, (tx) => tx<{ storage_path: string; file_name: string }[]>`
    select storage_path, file_name from public.artwork_files where id = ${fileId} and deleted_at is null`);
  const f = rows[0];
  if (!f) return null;
  return signedUrl("artwork", f.storage_path, { expiresIn: 300, downloadName: download ? f.file_name : undefined });
}

export type ApproveResult = { ok: true; approvedAt: Date } | { ok: false; error: "not_found" | "not_pending" | "name" };

/**
 * El cliente aprueba el proof: queda registrado con fecha, hora, nombre, IP y
 * navegador en artwork_approvals (inmutable; un trigger marca el proof como
 * aprobado con la misma marca de tiempo).
 */
export async function approveProof(
  accessToken: string,
  fileId: string,
  input: { name: string; ip: string | null; userAgent: string | null },
): Promise<ApproveResult> {
  const name = input.name.trim().slice(0, 160);
  if (name.length < 3) return { ok: false, error: "name" };
  const request = await getRequestByToken(accessToken);
  if (!request || !/^[0-9a-f-]{36}$/i.test(fileId)) return { ok: false, error: "not_found" };
  return withActor(serviceActor, async (tx) => {
    const [file] = await tx<{ id: string; status: ArtworkStatus; kind: string }[]>`
      select id, status, kind from public.artwork_files where id = ${fileId} and request_id = ${request.id} for update`;
    if (!file) return { ok: false, error: "not_found" } as const;
    if (file.kind !== "proof" || file.status !== "proof_sent") return { ok: false, error: "not_pending" } as const;
    const [approval] = await tx<{ approved_at: Date }[]>`
      insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name, approved_by_email, ip, user_agent)
      values (${file.id}, ${request.id}, ${name}, ${request.contactEmail}, ${input.ip}, ${input.userAgent?.slice(0, 300) ?? null})
      returning approved_at`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, channel, kind, body, payload)
      values (${request.id}, 'artwork_file', ${file.id}, 'system', 'proof_approved', ${name}, ${tx.json({ ip: input.ip })})`;
    return { ok: true, approvedAt: approval?.approved_at ?? new Date() } as const;
  });
}

export type ReplyResult = { ok: true } | { ok: false; error: "not_found" | "body" | "status" };

/**
 * Respuesta del cliente desde su enlace mientras la solicitud espera datos
 * (PRD §11: "todo contacto se registra en la solicitud"). Queda en el
 * historial y avisa al equipo.
 */
export async function clientReply(accessToken: string, text: string): Promise<ReplyResult> {
  const body = text.trim().slice(0, 4000);
  if (body.length < 2) return { ok: false, error: "body" };
  const request = await getRequestByToken(accessToken);
  if (!request) return { ok: false, error: "not_found" };
  if (request.status !== "data_pending") return { ok: false, error: "status" };
  await withActor(serviceActor, (tx) => tx`
    insert into public.activities (request_id, entity_type, entity_id, channel, kind, body)
    values (${request.id}, 'quote_request', ${request.id}, 'system', 'client_reply', ${body})`);
  await enqueueNotification("client_replied", request.id, {
    entityType: "quote_request",
    entityId: request.id,
    vars: { respuesta: body.length > 300 ? `${body.slice(0, 299)}…` : body },
    dedupe: `client_reply:${request.id}:${Date.now()}`,
  });
  return { ok: true };
}
