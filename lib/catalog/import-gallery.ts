import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { serviceActor, withActor } from "@/lib/db/actor";
import { detectFileKind, extensionForKind, IMAGE_KINDS, mimeForKind } from "@/lib/files/magic";
import { publicUrl, putObject } from "@/lib/storage";

/**
 * Importa fotos de la galería desde una carpeta (E10). Nombres:
 *   M-001.jpg      → foto principal de la muestra M-001
 *   M-001-2.jpg    → foto adicional (también M-001_2 o "M-001 2")
 * La muestra debe existir en admin > Catálogo > Galería; con `create`, las que
 * faltan se crean inactivas y PROVISIONAL (nombre = código) para completarlas
 * en el panel antes de publicarlas. Volver a correrla no duplica fotos: la ruta
 * del archivo sale de su contenido.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const NAME = /^(M-\d{3,5})(?:[-_ ](\d{1,2}))?\.(jpe?g|png|webp)$/i;

export type ImportOutcome =
  | { file: string; code: string; status: "main" | "extra" | "unchanged" | "created" }
  | { file: string; code: string | null; status: "skipped"; reason: "name" | "type" | "size" | "missing" };

export async function importGalleryFolder(folder: string, opts: { create?: boolean; dryRun?: boolean } = {}): Promise<ImportOutcome[]> {
  const entries = (await fs.readdir(folder, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  // Por código y, dentro de cada código, la principal antes que las adicionales.
  const key = (name: string) => {
    const m = name.match(NAME);
    return m ? `${m[1]!.toUpperCase()}#${String(Number(m[2] ?? 0)).padStart(2, "0")}` : `~${name}`;
  };
  entries.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const out: ImportOutcome[] = [];
  for (const file of entries) {
    const match = file.match(NAME);
    if (!match) {
      if (!file.startsWith(".")) out.push({ file, code: null, status: "skipped", reason: "name" });
      continue;
    }
    const code = match[1]!.toUpperCase();
    const extra = Boolean(match[2]) && match[2] !== "1";
    const bytes = await fs.readFile(path.join(folder, file));
    if (bytes.length > MAX_PHOTO_BYTES) {
      out.push({ file, code, status: "skipped", reason: "size" });
      continue;
    }
    const kind = detectFileKind(bytes.subarray(0, 1024), file);
    if (!IMAGE_KINDS.includes(kind)) {
      out.push({ file, code, status: "skipped", reason: "type" });
      continue;
    }
    const outcome = await withActor(serviceActor, async (tx) => {
      let [sample] = await tx<{ id: string; photo_url: string | null; photos: string[] }[]>`
        select id, photo_url, photos from public.gallery_samples where code = ${code}`;
      let created = false;
      if (!sample) {
        if (!opts.create) return { file, code, status: "skipped", reason: "missing" } as const;
        if (opts.dryRun) return { file, code, status: "created" } as const;
        [sample] = await tx<{ id: string; photo_url: string | null; photos: string[] }[]>`
          insert into public.gallery_samples (code, name, is_active, is_provisional)
          values (${code}, ${code}, false, true) returning id, photo_url, photos`;
        created = true;
      }
      const objectPath = `gallery_samples/${sample!.id}/import-${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${extensionForKind(kind)}`;
      const url = publicUrl("catalog", objectPath);
      const current = extra ? (sample!.photos ?? []).includes(url) : sample!.photo_url === url;
      if (current) return { file, code, status: "unchanged" } as const;
      if (opts.dryRun) return { file, code, status: extra ? "extra" : "main" } as const;
      await putObject("catalog", objectPath, bytes, mimeForKind(kind));
      if (extra) await tx`update public.gallery_samples set photos = array_append(photos, ${url}) where id = ${sample!.id}`;
      else await tx`update public.gallery_samples set photo_url = ${url} where id = ${sample!.id}`;
      return { file, code, status: created ? "created" : extra ? "extra" : "main" } as const;
    });
    out.push(outcome);
  }
  return out;
}
