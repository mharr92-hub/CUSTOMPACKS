/**
 * Rutas de archivos en el bucket privado `artwork`. El prefijo identifica a
 * quién pertenece el archivo; el servidor valida el prefijo antes de aceptar
 * o servir cualquier archivo.
 */
const SAFE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

function safeName(original: string): string {
  const base = original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return base || "archivo";
}

export type UploadPurpose = "artwork" | "reference" | "proof";

/** Antes de enviar la solicitud: el archivo cuelga del borrador. */
export function draftFilePath(draftToken: string, itemKey: string, purpose: UploadPurpose, nonce: string, fileName: string): string {
  if (!SAFE_KEY.test(draftToken) || !SAFE_KEY.test(itemKey) || !SAFE_KEY.test(nonce)) throw new Error("clave no válida");
  return `drafts/${draftToken}/${itemKey}/${purpose}/${nonce}-${safeName(fileName)}`;
}

/** Después de enviar: el archivo cuelga de la solicitud y la pieza. */
export function requestFilePath(requestId: string, itemId: string, purpose: UploadPurpose, nonce: string, fileName: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^[0-9a-f-]{36}$/i.test(itemId) || !SAFE_KEY.test(nonce)) throw new Error("clave no válida");
  return `requests/${requestId}/${itemId}/${purpose}/${nonce}-${safeName(fileName)}`;
}

export function isDraftPathFor(path: string, draftToken: string, itemKey: string, purpose: UploadPurpose): boolean {
  return path.startsWith(`drafts/${draftToken}/${itemKey}/${purpose}/`) && !path.includes("..");
}

export function isRequestPathFor(path: string, requestId: string, itemId: string, purpose: UploadPurpose): boolean {
  return path.startsWith(`requests/${requestId}/${itemId}/${purpose}/`) && !path.includes("..");
}
