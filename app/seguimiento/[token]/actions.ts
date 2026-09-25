"use server";

import { revalidatePath } from "next/cache";
import { approveProof, portalFileUrl, type ApproveResult } from "@/lib/artwork/client-portal";
import type { ConfirmResult, SlotResult } from "@/lib/artwork/upload-types";
import { confirmUpload, prepareUpload } from "@/lib/artwork/uploads";
import { clientInfo } from "@/lib/http/client-info";

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
