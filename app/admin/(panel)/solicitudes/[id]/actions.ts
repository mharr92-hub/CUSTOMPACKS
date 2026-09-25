"use server";

import { revalidatePath } from "next/cache";
import { canUploadProof, releaseProof, reviewArtwork, staffFileUrl, type ReviewResult } from "@/lib/artwork/staff";
import type { ArtworkStatus, Checklist } from "@/lib/artwork/states";
import type { ConfirmResult, SlotResult } from "@/lib/artwork/upload-types";
import { confirmUpload, prepareUpload } from "@/lib/artwork/uploads";
import { assertStaff, EDITOR_ROLES } from "@/lib/auth";
import { kickNotifications, markWhatsappSent } from "@/lib/notify";
import { addRequestNote, assignRequest, changeRequestStatus, requestMissingData, type ActionResult } from "@/lib/panel/requests";
import type { RequestStatus } from "@/lib/states";

/* Acciones del equipo sobre el arte de una solicitud (asignado o admin; lo valida la base). */

export async function staffFileUrlAction(fileId: string, download: boolean): Promise<string | null> {
  const user = await assertStaff();
  return staffFileUrl(user, String(fileId), Boolean(download));
}

export async function reviewArtworkAction(
  requestId: string,
  fileId: string,
  input: { status: ArtworkStatus; checklist: Checklist; comments: string },
): Promise<ReviewResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await reviewArtwork(user, String(fileId), { status: input.status, checklist: input.checklist, comments: String(input.comments ?? "") });
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/admin/solicitudes/${requestId}`);
  }
  return result;
}

export async function releaseProofAction(requestId: string, fileId: string): Promise<ReviewResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await releaseProof(user, String(fileId));
  if (result.ok) revalidatePath(`/admin/solicitudes/${requestId}`);
  return result;
}

export async function prepareProofUploadAction(requestId: string, itemId: string, file: { name: string; size: number }): Promise<SlotResult> {
  const user = await assertStaff(EDITOR_ROLES);
  if (!(await canUploadProof(user, requestId, itemId))) return { ok: false, error: "expired" };
  return prepareUpload({ scope: "staff", user, requestId, itemId, purpose: "proof" }, { name: String(file.name).slice(0, 200), size: Number(file.size) });
}

export async function confirmProofUploadAction(requestId: string, itemId: string, input: { path: string; name: string; size: number }): Promise<ConfirmResult> {
  const user = await assertStaff(EDITOR_ROLES);
  if (!(await canUploadProof(user, requestId, itemId))) return { ok: false, error: "expired" };
  const result = await confirmUpload(
    { scope: "staff", user, requestId, itemId, purpose: "proof" },
    { path: String(input.path), name: String(input.name).slice(0, 200), size: Number(input.size) },
  );
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/admin/solicitudes/${requestId}`);
  }
  return result;
}

/** El equipo confirma que envió el WhatsApp precargado. */
export async function markWhatsappSentAction(requestId: string, notificationId: string): Promise<boolean> {
  const user = await assertStaff(EDITOR_ROLES);
  const ok = await markWhatsappSent(user, String(notificationId));
  if (ok) revalidatePath(`/admin/solicitudes/${requestId}`);
  return ok;
}

/** Tomar la solicitud, asignarla a alguien o al siguiente en turno. */
export async function assignAction(requestId: string, to: string): Promise<ActionResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await assignRequest(user, String(requestId), String(to));
  if (result.ok) {
    revalidatePath(`/admin/solicitudes/${requestId}`);
    revalidatePath("/admin/solicitudes");
  }
  return result.ok ? { ok: true } : result;
}

export async function changeStatusAction(
  requestId: string,
  to: RequestStatus,
  opts: { reason?: string; lossReason?: string; lossNote?: string },
): Promise<ActionResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await changeRequestStatus(user, String(requestId), to, {
    reason: String(opts.reason ?? ""),
    lossReason: String(opts.lossReason ?? ""),
    lossNote: String(opts.lossNote ?? ""),
  });
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/admin/solicitudes/${requestId}`);
    revalidatePath("/admin/solicitudes");
  }
  return result;
}

/** "Pedir datos faltantes": pasa a Datos pendientes con la lista y avisa al cliente. */
export async function requestMissingDataAction(requestId: string, list: string): Promise<ActionResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await requestMissingData(user, String(requestId), String(list));
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/admin/solicitudes/${requestId}`);
    revalidatePath("/admin/solicitudes");
  }
  return result;
}

/** Nota interna o registro de un contacto con el cliente. */
export async function addNoteAction(requestId: string, input: { channel: string; body: string }): Promise<ActionResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await addRequestNote(user, String(requestId), { channel: String(input.channel), body: String(input.body) });
  if (result.ok) revalidatePath(`/admin/solicitudes/${requestId}`);
  return result;
}
