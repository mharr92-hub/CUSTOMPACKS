import "server-only";
import { detectFileKind, IMAGE_KINDS } from "@/lib/files/magic";

/**
 * Fotos del catálogo y de la galería a partir de escaneos (Bloque 2):
 * - PDF de varias páginas: una imagen por página.
 * - JPG, PNG o WebP grandes: se aceptan hasta MAX_SCAN_BYTES.
 * Cada imagen se endereza (EXIF), se le recortan los márgenes blancos, se
 * reduce a FULL_PX de lado mayor y se guarda en WebP, más una miniatura de
 * THUMB_PX (mismo nombre con "-mini") para los listados del panel.
 * sharp y pdfjs se cargan solo aquí (scripts de importación), nunca en la web.
 */
export const MAX_SCAN_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
const FULL_PX = 2000;
const THUMB_PX = 480;
/** Diferencia con el blanco que todavía cuenta como margen (escaneos con fondo gris claro). */
const TRIM_THRESHOLD = 40;

export type ScanKind = "image" | "pdf" | "other";

export function scanKind(bytes: Uint8Array, fileName: string): ScanKind {
  const kind = detectFileKind(bytes.subarray(0, 1024), fileName);
  if (kind === "pdf") return "pdf";
  return IMAGE_KINDS.includes(kind) ? "image" : "other";
}

/** Páginas de un PDF como PNG, con el lado mayor cerca de 2400 px. */
export async function pdfPages(bytes: Uint8Array): Promise<Buffer[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    if (doc.numPages > MAX_PDF_PAGES) throw new Error(`El PDF tiene ${doc.numPages} páginas (máximo ${MAX_PDF_PAGES}).`);
    const pages: Buffer[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 2400 / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
      pages.push(canvas.toBuffer("image/png"));
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

export type ProcessedPhoto = { full: Buffer; thumb: Buffer; width: number; height: number };

/** Endereza, recorta el margen blanco y genera la foto WebP y su miniatura. */
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  const sharp = (await import("sharp")).default;
  const oriented = await sharp(input, { limitInputPixels: 400_000_000 }).rotate().flatten({ background: "#ffffff" }).toBuffer();
  let trimmed = oriented;
  try {
    trimmed = await sharp(oriented).trim({ background: "#ffffff", threshold: TRIM_THRESHOLD }).toBuffer();
  } catch {
    // Imagen toda blanca o sin margen que recortar: se usa entera.
  }
  const full = await sharp(trimmed).resize({ width: FULL_PX, height: FULL_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(trimmed).resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

/** Imágenes de un archivo escaneado: las páginas si es PDF, o la imagen tal cual. */
export async function scanImages(bytes: Buffer, fileName: string): Promise<Buffer[]> {
  const kind = scanKind(bytes, fileName);
  if (kind === "pdf") return pdfPages(bytes);
  if (kind === "image") return [bytes];
  return [];
}

export { thumbnailUrl } from "./thumbnail";
