"use server";

import { revalidatePath } from "next/cache";
import { canUploadProof, releaseProof, reviewArtwork, staffFileUrl, type ReviewResult } from "@/lib/artwork/staff";
import type { ArtworkStatus, Checklist } from "@/lib/artwork/states";
import type { ConfirmResult, SlotResult } from "@/lib/artwork/upload-types";
import { confirmUpload, prepareUpload } from "@/lib/artwork/uploads";
import { assertStaff, EDITOR_ROLES } from "@/lib/auth";
import { kickNotifications, markWhatsappSent } from "@/lib/notify";
import { addRequestNote, assignRequest, changeRequestStatus, requestMissingData, type ActionResult } from "@/lib/panel/requests";
import { createQuoteDraft, issueQuote, quoteFileUrl, updateQuoteDraft, type QuoteDraftInput, type QuoteResult } from "@/lib/quotes";
import { generateRfq, recordRfqResponse, rfqFileUrl, sendRfq, type RfqResponseInput, type RfqResult } from "@/lib/rfq";
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

// ---------------------------------------------------------------------------
// RFQ y cotización (E7)
// ---------------------------------------------------------------------------
function refresh(requestId: string) {
  revalidatePath(`/admin/solicitudes/${requestId}`);
  revalidatePath("/admin/solicitudes");
}

export async function generateRfqAction(requestId: string): Promise<RfqResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await generateRfq(user, String(requestId));
  if (result.ok) refresh(requestId);
  return result.ok ? { ok: true } : result;
}

export async function sendRfqAction(requestId: string, rfqId: string): Promise<RfqResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await sendRfq(user, String(rfqId));
  if (result.ok) refresh(requestId);
  return result;
}

export async function recordRfqResponseAction(requestId: string, rfqId: string, input: RfqResponseInput): Promise<RfqResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await recordRfqResponse(user, String(rfqId), {
    costs: Array.isArray(input.costs) ? input.costs.map((c) => ({ itemId: String(c.itemId), quantity: Number(c.quantity), unitCost: String(c.unitCost) })) : [],
    currency: String(input.currency ?? "USD"),
    productionDays: String(input.productionDays ?? ""),
    notes: String(input.notes ?? ""),
  });
  if (result.ok) refresh(requestId);
  return result;
}

export async function rfqFileUrlAction(rfqId: string, kind: "pdf" | "xlsx"): Promise<string | null> {
  const user = await assertStaff();
  return rfqFileUrl(user, String(rfqId), kind === "xlsx" ? "xlsx" : "pdf");
}

export async function createQuoteDraftAction(requestId: string): Promise<QuoteResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await createQuoteDraft(user, String(requestId));
  if (result.ok) refresh(requestId);
  return result.ok ? { ok: true } : result;
}

export async function updateQuoteDraftAction(requestId: string, quoteId: string, input: QuoteDraftInput): Promise<QuoteResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await updateQuoteDraft(user, String(quoteId), {
    lines: Array.isArray(input.lines)
      ? input.lines.map((l) => ({
          itemId: String(l.itemId),
          quantity: Number(l.quantity),
          unitCost: String(l.unitCost),
          freightTotal: String(l.freightTotal),
          marginPct: String(l.marginPct),
          leadTimeDays: String(l.leadTimeDays),
        }))
      : [],
    validUntil: String(input.validUntil ?? ""),
    notes: String(input.notes ?? ""),
  });
  if (result.ok) refresh(requestId);
  return result.ok ? { ok: true } : result;
}

export async function issueQuoteAction(requestId: string, quoteId: string): Promise<QuoteResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await issueQuote(user, String(quoteId));
  if (result.ok) {
    kickNotifications();
    refresh(requestId);
  }
  return result.ok ? { ok: true } : result;
}

export async function quoteFileUrlAction(quoteId: string): Promise<string | null> {
  const user = await assertStaff();
  return quoteFileUrl(user, String(quoteId));
}
