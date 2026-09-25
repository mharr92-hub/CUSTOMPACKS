"use server";

import type { ConfirmResult, SlotResult } from "@/lib/artwork/upload-types";
import { confirmUpload, draftFileUrl, prepareUpload, removeDraftFile } from "@/lib/artwork/uploads";
import { isDraftToken } from "@/lib/quote/drafts";

type Purpose = "artwork" | "reference";

function valid(token: string, itemKey: string, purpose: string): purpose is Purpose {
  return isDraftToken(token) && /^[A-Za-z0-9_-]{1,64}$/.test(itemKey) && (purpose === "artwork" || purpose === "reference");
}

/** Subidas del paso 7 del cotizador (los archivos cuelgan del borrador hasta enviar). */
export async function prepareDraftUploadAction(draftToken: string, itemKey: string, purpose: string, file: { name: string; size: number }): Promise<SlotResult> {
  if (!valid(draftToken, itemKey, purpose)) return { ok: false, error: "expired" };
  return prepareUpload({ scope: "draft", draftToken, itemKey, purpose }, { name: String(file.name).slice(0, 200), size: Number(file.size) });
}

export async function confirmDraftUploadAction(
  draftToken: string,
  itemKey: string,
  purpose: string,
  input: { path: string; name: string; size: number },
): Promise<ConfirmResult> {
  if (!valid(draftToken, itemKey, purpose)) return { ok: false, error: "expired" };
  return confirmUpload({ scope: "draft", draftToken, itemKey, purpose }, { path: String(input.path), name: String(input.name).slice(0, 200), size: Number(input.size) });
}

export async function draftFileUrlAction(draftToken: string, itemKey: string, path: string): Promise<string | null> {
  if (!isDraftToken(draftToken) || !/^[A-Za-z0-9_-]{1,64}$/.test(itemKey)) return null;
  return draftFileUrl(draftToken, itemKey, String(path));
}

export async function removeDraftFileAction(draftToken: string, itemKey: string, path: string): Promise<boolean> {
  if (!isDraftToken(draftToken) || !/^[A-Za-z0-9_-]{1,64}$/.test(itemKey)) return false;
  return removeDraftFile(draftToken, itemKey, String(path));
}
