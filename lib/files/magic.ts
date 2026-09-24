/**
 * Detección del tipo real de archivo por sus primeros bytes ("magic bytes"),
 * sin confiar en la extensión ni en el Content-Type que envía el navegador.
 */
export type DetectedKind = "pdf" | "ai" | "eps" | "svg" | "png" | "jpeg" | "webp" | "gif" | "unknown";

const MIME: Record<DetectedKind, string> = {
  pdf: "application/pdf",
  ai: "application/postscript",
  eps: "application/postscript",
  svg: "image/svg+xml",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  unknown: "application/octet-stream",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function asciiHead(bytes: Uint8Array, length = 1024): string {
  let out = "";
  const n = Math.min(bytes.length, length);
  for (let i = 0; i < n; i++) out += String.fromCharCode(bytes[i] as number);
  return out;
}

/**
 * @param bytes primeros bytes del archivo (con 1 KB basta)
 * @param fileName nombre original; solo desempata entre PDF y AI (un .ai
 *        moderno es un PDF por dentro)
 */
export function detectFileKind(bytes: Uint8Array, fileName = ""): DetectedKind {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return ext === "ai" ? "ai" : "pdf"; // %PDF-
  if (startsWith(bytes, [0xc5, 0xd0, 0xd3, 0xc6])) return "eps"; // EPS binario (DOS)
  if (startsWith(bytes, [0x25, 0x21, 0x50, 0x53])) {
    // %!PS
    const head = asciiHead(bytes, 256);
    if (/EPSF/.test(head) || ext === "eps") return "eps";
    return ext === "ai" ? "ai" : "eps";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  const text = asciiHead(bytes).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text)) return "svg";
  return "unknown";
}

export function mimeForKind(kind: DetectedKind): string {
  return MIME[kind];
}

export const IMAGE_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp"];
export const ARTWORK_KINDS: readonly DetectedKind[] = ["pdf", "ai", "eps", "svg"];
export const REFERENCE_KINDS: readonly DetectedKind[] = ["png", "jpeg", "webp", "gif", "pdf"];

export function extensionForKind(kind: DetectedKind): string {
  return kind === "jpeg" ? "jpg" : kind === "unknown" ? "bin" : kind;
}
