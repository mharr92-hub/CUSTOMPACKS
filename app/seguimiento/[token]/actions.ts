"use server";

import { revalidatePath } from "next/cache";
import { approveProof, clientReply, portalFileUrl, type ApproveResult, type ReplyResult } from "@/lib/artwork/client-portal";
import type { ConfirmResult, SlotResult } from "@/lib/artwork/upload-types";
import { confirmUpload, prepareUpload } from "@/lib/artwork/uploads";
import { clientInfo } from "@/lib/http/client-info";
import { kickNotifications } from "@/lib/notify";
import { confirmReceiptUpload, prepareReceiptUpload, submitSurvey, type OrderResult, type UploadConfirm, type UploadSlot } from "@/lib/orders";
import { acceptQuote, requestQuoteChanges, type QuoteResult } from "@/lib/quotes";

/*
 * Acciones del portal del cliente (enlace seguro). Todo se valida contra el
 * token: solo alcanzan archivos y piezas de esa solicitud.
 */
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function valid(token: string, itemId: string): boolean {
  return TOKEN.test(token) && UUID.test(itemId);
}

export async function preparePortalUploadAction(token: string, itemId: string, file: { name: string; size: number }): Promise<SlotResult> {
  if (!valid(token, itemId)) return { ok: false, error: "expired" };
  return prepareUpload({ scope: "client", accessToken: token, itemId, purpose: "artwork" }, { name: String(file.name).slice(0, 200), size: Number(file.size) });
}

export async function confirmPortalUploadAction(token: string, itemId: string, input: { path: string; name: string; size: number }): Promise<ConfirmResult> {
  if (!valid(token, itemId)) return { ok: false, error: "expired" };
  const result = await confirmUpload(
    { scope: "client", accessToken: token, itemId, purpose: "artwork" },
    { path: String(input.path), name: String(input.name).slice(0, 200), size: Number(input.size) },
  );
  if (result.ok) revalidatePath(`/seguimiento/${token}`);
  return result;
}

export async function portalFileUrlAction(token: string, fileId: string, download: boolean): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  return portalFileUrl(token, fileId, download);
}

export async function approveProofAction(token: string, fileId: string, name: string): Promise<ApproveResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_found" };
  const result = await approveProof(token, fileId, { name: String(name), ...(await clientInfo()) });
  if (result.ok) revalidatePath(`/seguimiento/${token}`);
  return result;
}

/** Respuesta del cliente a "nos faltan datos". */
export async function clientReplyAction(token: string, text: string): Promise<ReplyResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_found" };
  const result = await clientReply(token, String(text));
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/seguimiento/${token}`);
  }
  return result;
}

/** Aceptar la cotización eligiendo una cantidad por pieza (registra fecha, nombre, IP y navegador). */
export async function acceptQuoteAction(token: string, quoteId: string, input: { name: string; selection: { itemId: string; quantity: number }[] }): Promise<QuoteResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_found" };
  const selection = Array.isArray(input.selection) ? input.selection.map((s) => ({ itemId: String(s.itemId), quantity: Number(s.quantity) })) : [];
  const result = await acceptQuote(token, String(quoteId), { name: String(input.name ?? ""), selection, ...(await clientInfo()) });
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/seguimiento/${token}`);
  }
  return result;
}

/** "Pedir cambios" a la cotización. */
export async function requestQuoteChangesAction(token: string, quoteId: string, text: string): Promise<QuoteResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_found" };
  const result = await requestQuoteChanges(token, String(quoteId), String(text));
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/seguimiento/${token}`);
  }
  return result;
}

/** Comprobante de pago del pedido (queda por confirmar). */
export async function prepareReceiptUploadAction(token: string, file: { name: string; size: number }): Promise<UploadSlot> {
  if (!TOKEN.test(token)) return { ok: false, error: "expired" };
  return prepareReceiptUpload(token, { name: String(file.name).slice(0, 200), size: Number(file.size) });
}

export async function confirmReceiptUploadAction(token: string, input: { path: string; name: string }): Promise<UploadConfirm> {
  if (!TOKEN.test(token)) return { ok: false, error: "expired" };
  const result = await confirmReceiptUpload(token, { path: String(input.path), name: String(input.name).slice(0, 200) });
  if (result.ok) {
    kickNotifications();
    revalidatePath(`/seguimiento/${token}`);
  }
  return result;
}

/** Encuesta NPS del pedido cerrado. */
export async function submitSurveyAction(token: string, input: { score: number; comment: string }): Promise<OrderResult> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_found" };
  const result = await submitSurvey(token, { score: Number(input.score), comment: String(input.comment ?? ""), ip: (await clientInfo()).ip });
  if (result.ok) revalidatePath(`/seguimiento/${token}`);
  return result;
}
