import "server-only";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { detectFileKind, type DetectedKind } from "@/lib/files/magic";
import { readObjectHead, removeObject, signedUploadUrl } from "@/lib/storage";

/**
 * Subida verificada (COD-05): URL firmada para subir directo desde el
 * navegador y, al confirmar, revisión del tipo real del archivo por sus
 * primeros bytes y del tamaño. La usan las evidencias y comprobantes del
 * pedido y la captura de una aceptación registrada por el equipo.
 */
export const EVIDENCE_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp", "mp4", "mov", "pdf"];
export const RECEIPT_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp", "pdf"];
export const EVIDENCE_EXT = ["png", "jpg", "jpeg", "webp", "mp4", "mov", "pdf"];
export const RECEIPT_EXT = ["png", "jpg", "jpeg", "webp", "pdf"];

export function safeName(original: string): string {
  const base = original.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(-80);
  return base || "archivo";
}

export type UploadSlot = { ok: true; url: string; method: "PUT"; headers: Record<string, string>; path: string } | { ok: false; error: "tooLarge" | "tooMany" | "badType" | "expired" | "generic" };
export type UploadConfirm = { ok: true; file: { id: string; name: string; size: number; path: string; kind: string } } | { ok: false; error: "typeMismatch" | "tooLarge" | "expired" | "network" | "generic" };

export async function maxBytes(): Promise<number> {
  return uploadSettings(await getPublicCatalog()).maxMb * 1024 * 1024;
}

export async function slot(bucket: "evidence" | "documents", path: string, size: number, name: string, allowed: readonly string[]): Promise<UploadSlot> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!allowed.includes(ext)) return { ok: false, error: "badType" };
  const max = await maxBytes();
  if (!Number.isFinite(size) || size <= 0 || size > max) return { ok: false, error: "tooLarge" };
  try {
    return { ok: true, ...(await signedUploadUrl(bucket, path, { maxBytes: max, expiresIn: 3600 })), path };
  } catch {
    return { ok: false, error: "generic" };
  }
}

export async function verify(bucket: "evidence" | "documents", path: string, name: string, kinds: readonly DetectedKind[]): Promise<{ kind: DetectedKind; size: number } | { error: "typeMismatch" | "tooLarge" | "network" }> {
  const head = await readObjectHead(bucket, path, 2048);
  if (!head) return { error: "network" };
  const kind = detectFileKind(head.head, name);
  if (!kinds.includes(kind)) {
    await removeObject(bucket, path).catch(() => {});
    return { error: "typeMismatch" };
  }
  if (head.size > (await maxBytes())) {
    await removeObject(bucket, path).catch(() => {});
    return { error: "tooLarge" };
  }
  return { kind, size: head.size };
}
