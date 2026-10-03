import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { serviceActor, withActor } from "@/lib/db/actor";
import { publicUrl, putObject } from "@/lib/storage";
import { parseCsv } from "./csv";
import { MAX_SCAN_BYTES, pdfPages, processPhoto, scanKind } from "./photos";

/**
 * Importa fotos de la galería desde una carpeta (E10 y Bloque 2). Acepta
 * escaneos: JPG, PNG o WebP grandes y PDF de varias páginas (una foto por
 * página). Cada foto se recorta (margen blanco), se pasa a WebP y lleva una
 * miniatura (ver ./photos.ts).
 *
 * El código de muestra sale:
 * - del nombre del archivo: M-001.jpg es la foto principal de M-001, y
 *   M-001-2.jpg (o M-001_2, "M-001 2") una adicional; en M-001.pdf la primera
 *   página es la principal y las demás, adicionales;
 * - o de un CSV de orden (`order`), cuando el escáner pone sus propios nombres:
 *   con columnas archivo, pagina (opcional) y codigo, o solo con codigo, que se
 *   asigna en orden a las fotos (archivos por nombre, páginas en orden). Un
 *   código repetido agrega fotos adicionales; la primera es la principal.
 *
 * La muestra debe existir; con `create`, las que faltan se crean inactivas y
 * PROVISIONAL (nombre = código). Volver a correrla no duplica fotos: la ruta
 * sale del contenido.
 */
const NAME = /^(M-\d{3,5})(?:[-_ ](\d{1,2}))?\.(jpe?g|png|webp|pdf)$/i;
const CODE = /^M-\d{3,5}$/;

export type ImportOutcome =
  | { file: string; page?: number; code: string; status: "main" | "extra" | "unchanged" | "created" }
  | { file: string; page?: number; code: string | null; status: "skipped"; reason: "name" | "type" | "size" | "missing" | "order" | "pdf" };

type Image = { file: string; page?: number; bytes: () => Promise<Buffer>; nameCode: string | null; nameExtra: boolean };
type Assigned = Image & { code: string; extra: boolean };

const natural = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

async function listImages(folder: string, out: ImportOutcome[]): Promise<Image[]> {
  const files = (await fs.readdir(folder, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((name) => !/\.csv$/i.test(name))
    .sort(natural.compare);
  const images: Image[] = [];
  for (const file of files) {
    const full = path.join(folder, file);
    const stat = await fs.stat(full);
    const match = file.match(NAME);
    const nameCode = match ? match[1]!.toUpperCase() : null;
    const nameExtra = Boolean(match?.[2]) && match?.[2] !== "1";
    if (stat.size > MAX_SCAN_BYTES) {
      out.push({ file, code: nameCode, status: "skipped", reason: "size" });
      continue;
    }
    const bytes = await fs.readFile(full);
    const kind = scanKind(bytes, file);
    if (kind === "other") {
      out.push({ file, code: nameCode, status: "skipped", reason: match ? "type" : "name" });
      continue;
    }
    if (kind === "image") {
      images.push({ file, bytes: async () => bytes, nameCode, nameExtra });
      continue;
    }
    let pages: Buffer[];
    try {
      pages = await pdfPages(bytes);
    } catch {
      out.push({ file, code: nameCode, status: "skipped", reason: "pdf" });
      continue;
    }
    pages.forEach((page, i) => images.push({ file, page: i + 1, bytes: async () => page, nameCode, nameExtra: nameExtra || i > 0 }));
  }
  return images;
}

/** Asigna un código a cada foto: por nombre o por el CSV de orden. */
async function assign(images: Image[], orderFile: string | undefined, out: ImportOutcome[]): Promise<Assigned[]> {
  const assigned: Assigned[] = [];
  const seen = new Set<string>();
  const push = (img: Image, code: string, forceExtra = false) => {
    const extra = forceExtra || seen.has(code);
    seen.add(code);
    assigned.push({ ...img, code, extra });
  };
  if (!orderFile) {
    // Principales antes que adicionales, para que M-001-2.jpg no gane a M-001.jpg.
    const sorted = [...images].sort((a, b) => Number(a.nameExtra) - Number(b.nameExtra));
    for (const img of sorted) {
      if (!img.nameCode) out.push({ file: img.file, page: img.page, code: null, status: "skipped", reason: "name" });
      else push(img, img.nameCode, img.nameExtra);
    }
    return assigned;
  }
  const { headers, rows } = parseCsv(await fs.readFile(orderFile, "utf8"));
  const codeOf = (v: Record<string, string>) => (v.codigo ?? v.code ?? "").toUpperCase();
  if (headers.includes("archivo")) {
    const used = new Set<Image>();
    for (const row of rows) {
      const code = codeOf(row.values);
      if (!CODE.test(code)) continue;
      const page = row.values.pagina ? Number(row.values.pagina) : null;
      for (const img of images.filter((i) => i.file.toLowerCase() === row.values.archivo!.toLowerCase() && (page === null || i.page === page))) {
        used.add(img);
        push(img, code);
      }
    }
    for (const img of images.filter((i) => !used.has(i))) out.push({ file: img.file, page: img.page, code: null, status: "skipped", reason: "order" });
    return assigned;
  }
  const codes = rows.map((r) => codeOf(r.values)).filter((c) => CODE.test(c));
  images.forEach((img, i) => {
    const code = codes[i];
    if (code) push(img, code);
    else out.push({ file: img.file, page: img.page, code: null, status: "skipped", reason: "order" });
  });
  return assigned;
}

export async function importGalleryFolder(folder: string, opts: { create?: boolean; dryRun?: boolean; order?: string } = {}): Promise<ImportOutcome[]> {
  const out: ImportOutcome[] = [];
  const images = await listImages(folder, out);
  const assigned = await assign(images, opts.order, out);
  for (const img of assigned) {
    const { code, extra, file, page } = img;
    const bytes = await img.bytes();
    const outcome = await withActor(serviceActor, async (tx): Promise<ImportOutcome> => {
      let [sample] = await tx<{ id: string; photo_url: string | null; photos: string[] }[]>`
        select id, photo_url, photos from public.gallery_samples where code = ${code}`;
      let created = false;
      if (!sample) {
        if (!opts.create) return { file, page, code, status: "skipped", reason: "missing" };
        if (opts.dryRun) return { file, page, code, status: "created" };
        [sample] = await tx<{ id: string; photo_url: string | null; photos: string[] }[]>`
          insert into public.gallery_samples (code, name, is_active, is_provisional)
          values (${code}, ${code}, false, true) returning id, photo_url, photos`;
        created = true;
      }
      const base = `gallery_samples/${sample!.id}/import-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;
      const url = publicUrl("catalog", `${base}.webp`);
      const current = extra ? (sample!.photos ?? []).includes(url) : sample!.photo_url === url;
      if (current) return { file, page, code, status: "unchanged" };
      if (opts.dryRun) return { file, page, code, status: extra ? "extra" : "main" };
      let photo;
      try {
        photo = await processPhoto(bytes);
      } catch {
        return { file, page, code, status: "skipped", reason: "type" };
      }
      await putObject("catalog", `${base}.webp`, photo.full, "image/webp");
      await putObject("catalog", `${base}-mini.webp`, photo.thumb, "image/webp");
      if (extra) await tx`update public.gallery_samples set photos = array_append(photos, ${url}) where id = ${sample!.id}`;
      else await tx`update public.gallery_samples set photo_url = ${url} where id = ${sample!.id}`;
      return { file, page, code, status: created ? "created" : extra ? "extra" : "main" };
    });
    out.push(outcome);
  }
  return out;
}
