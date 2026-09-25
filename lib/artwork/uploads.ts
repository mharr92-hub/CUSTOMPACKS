import "server-only";
import type { ConfirmResult, SlotResult, UploadedFile } from "./upload-types";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import { detectFileKind, extensionForKind, type DetectedKind } from "@/lib/files/magic";
import { log } from "@/lib/log";
import { loadDraft } from "@/lib/quote/drafts";
import { getRequestByToken } from "@/lib/quote/tracking";
import { readObjectHead, removeObject, signedUploadUrl, signedUrl } from "@/lib/storage";
import { fileNonce, randomToken } from "@/lib/tokens";
import { draftFilePath, isDraftPathFor, isRequestPathFor, requestFilePath, type UploadPurpose } from "./paths";

/**
 * Subidas de arte, referencias y proofs al bucket privado `artwork`.
 * 1) prepare: valida dueño, límites y extensión, y firma una URL de subida.
 * 2) el navegador sube directo (PUT) con barra de progreso.
 * 3) confirm: valida el prefijo de la ruta y el tipo REAL (magic bytes); si
 *    no corresponde, borra el archivo. Recién ahí se registra.
 */
export type UploadScope =
  | { scope: "draft"; draftToken: string; itemKey: string; purpose: "artwork" | "reference" }
  | { scope: "client"; accessToken: string; itemId: string; purpose: "artwork" | "reference" }
  | { scope: "staff"; user: CurrentUser; requestId: string; itemId: string; purpose: "artwork" | "proof" };

/** Extensiones que acepta cada propósito (PRD §9: PNG/JPG solo como referencia). */
export const EXTENSIONS: Record<UploadPurpose, readonly string[]> = {
  artwork: ["pdf", "ai", "eps", "svg"],
  reference: ["png", "jpg", "jpeg", "webp", "pdf"],
  proof: ["pdf", "png", "jpg", "jpeg"],
};

const KINDS: Record<UploadPurpose, readonly DetectedKind[]> = {
  artwork: ["pdf", "ai", "eps", "svg"],
  reference: ["png", "jpeg", "webp", "pdf"],
  proof: ["pdf", "png", "jpeg"],
};

export async function uploadLimits(): Promise<{ maxMb: number; maxFiles: number }> {
  return uploadSettings(await getPublicCatalog());
}

type Owner = { draftId: string; draftToken: string; itemKey: string; existing: number } | { requestId: string; itemId: string; existing: number };

/** Id del borrador abierto (no enviado) de ese token. */
async function openDraftId(draftToken: string): Promise<string | null> {
  const rows = await withActor({ kind: "anon", accessToken: draftToken }, (tx) => tx<{ id: string }[]>`
    select id from public.quote_drafts where token = ${draftToken} and submitted_request_id is null`);
  return rows[0]?.id ?? null;
}

async function resolveOwner(scope: UploadScope): Promise<Owner | null> {
  if (scope.scope === "draft") {
    const draft = await loadDraft(scope.draftToken);
    const item = draft?.state.items.find((it) => it.key === scope.itemKey);
    const draftId = draft && !draft.submittedRequestId && item ? await openDraftId(scope.draftToken) : null;
    if (!draftId) return null;
    const [row] = await withActor(serviceActor, (tx) => tx<{ n: number }[]>`
      select count(*)::int as n from public.quote_draft_files where draft_id = ${draftId} and item_key = ${scope.itemKey} and purpose = ${scope.purpose}`);
    return { draftId, draftToken: scope.draftToken, itemKey: scope.itemKey, existing: row?.n ?? 0 };
  }
  if (scope.scope === "client") {
    const request = await getRequestByToken(scope.accessToken);
    if (!request || !request.items.some((i) => i.id === scope.itemId)) return null;
    return { requestId: request.id, itemId: scope.itemId, existing: await countItemFiles(scope.itemId, scope.purpose) };
  }
  const allowed = await withActor(actorFor(scope.user), (tx) => tx<{ ok: boolean }[]>`
    select public.can_access_request_files(${scope.requestId}::uuid) and exists (
      select 1 from public.quote_items where id = ${scope.itemId}::uuid and request_id = ${scope.requestId}::uuid) as ok`);
  if (!allowed[0]?.ok) return null;
  return { requestId: scope.requestId, itemId: scope.itemId, existing: await countItemFiles(scope.itemId, scope.purpose) };
}

async function countItemFiles(itemId: string, purpose: UploadPurpose): Promise<number> {
  const [row] = await withActor(serviceActor, (tx) =>
    purpose === "reference"
      ? tx<{ n: number }[]>`select count(*)::int as n from public.quote_references where item_id = ${itemId} and kind = 'photo'`
      : tx<{ n: number }[]>`select count(*)::int as n from public.artwork_files where item_id = ${itemId} and kind = ${purpose === "proof" ? "proof" : "artwork"}`,
  );
  return row?.n ?? 0;
}

export async function prepareUpload(scope: UploadScope, file: { name: string; size: number }): Promise<SlotResult> {
  const { maxMb, maxFiles } = await uploadLimits();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONS[scope.purpose].includes(ext)) return { ok: false, error: "badType" };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxMb * 1024 * 1024) return { ok: false, error: "tooLarge" };
  const owner = await resolveOwner(scope);
  if (!owner) return { ok: false, error: "expired" };
  if (owner.existing >= maxFiles && scope.purpose !== "proof") return { ok: false, error: "tooMany" };
  const nonce = fileNonce();
  const path =
    "draftToken" in owner
      ? draftFilePath(owner.draftToken, owner.itemKey, scope.purpose, nonce, file.name)
      : requestFilePath(owner.requestId, owner.itemId, scope.purpose, nonce, file.name);
  try {
    const slot = await signedUploadUrl("artwork", path, { maxBytes: maxMb * 1024 * 1024, expiresIn: 60 * 60 });
    return { ok: true, ...slot, path };
  } catch (error) {
    log.error("no se pudo preparar la subida", { error });
    return { ok: false, error: "generic" };
  }
}

/** Verifica el archivo subido. Devuelve el registro (para borradores) o lo guarda en la solicitud. */
export async function confirmUpload(scope: UploadScope, input: { path: string; name: string; size: number }): Promise<ConfirmResult> {
  const owner = await resolveOwner(scope);
  if (!owner) return { ok: false, error: "expired" };
  const pathOk =
    "draftToken" in owner
      ? isDraftPathFor(input.path, owner.draftToken, owner.itemKey, scope.purpose)
      : isRequestPathFor(input.path, owner.requestId, owner.itemId, scope.purpose);
  if (!pathOk) {
    log.warn("confirmación de subida con una ruta ajena", { scope: scope.scope, purpose: scope.purpose });
    return { ok: false, error: "generic" };
  }

  const { maxMb } = await uploadLimits();
  const head = await readObjectHead("artwork", input.path, 2048);
  if (!head) return { ok: false, error: "network" };
  const kind = detectFileKind(head.head, input.name);
  if (!KINDS[scope.purpose].includes(kind)) {
    await removeObject("artwork", input.path).catch(() => {});
    return { ok: false, error: "typeMismatch" };
  }
  if (head.size > maxMb * 1024 * 1024) {
    await removeObject("artwork", input.path).catch(() => {});
    return { ok: false, error: "tooLarge" };
  }
  const file: UploadedFile = { id: input.path.split("/").pop()?.split("-")[0] ?? randomToken(8), name: input.name.slice(0, 200), size: head.size, path: input.path, kind };
  if ("draftToken" in owner) {
    await withActor(serviceActor, (tx) => tx`
      insert into public.quote_draft_files (draft_id, item_key, purpose, storage_path, file_name, format, size_bytes)
      values (${owner.draftId}, ${owner.itemKey}, ${scope.purpose}, ${input.path}, ${file.name}, ${kind}, ${head.size})
      on conflict (storage_path) do nothing`);
    return { ok: true, file, previewUrl: await signedUrl("artwork", input.path, { expiresIn: 300 }) };
  }

  const byStaff = scope.scope === "staff";
  await withActor(serviceActor, async (tx) => {
    if (scope.purpose === "reference") {
      await tx`insert into public.quote_references (item_id, kind, storage_path, note) values (${owner.itemId}, 'photo', ${input.path}, ${file.name})`;
    } else {
      const k = scope.purpose === "proof" ? "proof" : "artwork";
      const [v] = await tx<{ next: number }[]>`
        select coalesce(max(version), 0) + 1 as next from public.artwork_files where item_id = ${owner.itemId} and kind = ${k}`;
      await tx`
        insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client, created_by)
        values (${owner.itemId}, ${owner.requestId}, ${k}, ${v?.next ?? 1}, ${input.path}, ${file.name}, ${kind === "jpeg" ? "jpeg" : extensionForKind(kind)},
                ${head.size}, ${k === "proof" ? "proof_sent" : "received"}, ${!byStaff}, ${byStaff ? scope.user.userId : null})`;
    }
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${owner.requestId}, 'quote_item', ${owner.itemId}, ${byStaff ? scope.user.userId : null}, 'system',
              ${scope.purpose === "proof" ? "proof_uploaded" : scope.purpose === "reference" ? "reference_uploaded" : "artwork_uploaded"}, ${file.name})`;
  });
  return { ok: true, file };
}

/** Archivo verificado de un borrador abierto (la lista del navegador no basta: la valida el servidor). */
async function draftFile(draftToken: string, itemKey: string, path: string): Promise<{ id: string } | null> {
  const draftId = await openDraftId(draftToken);
  if (!draftId) return null;
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`
    select id from public.quote_draft_files where draft_id = ${draftId} and item_key = ${itemKey} and storage_path = ${path}`);
  return rows[0] ?? null;
}

/** URL firmada corta para ver un archivo de un borrador (solo con su token). */
export async function draftFileUrl(draftToken: string, itemKey: string, path: string): Promise<string | null> {
  if (!(await draftFile(draftToken, itemKey, path))) return null;
  return signedUrl("artwork", path, { expiresIn: 300 });
}

/** Quita un archivo de un borrador (registro y objeto). */
export async function removeDraftFile(draftToken: string, itemKey: string, path: string): Promise<boolean> {
  const file = await draftFile(draftToken, itemKey, path);
  if (!file) return false;
  await withActor(serviceActor, (tx) => tx`delete from public.quote_draft_files where id = ${file.id}`);
  await removeObject("artwork", path).catch((error) => log.error("no se pudo borrar un archivo del borrador", { error }));
  return true;
}
