import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeTestSql, testSql } from "../support/db";
import { scannedJpeg, scannedPdf } from "../support/scan-fixtures";

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { importGalleryFolder } = await import("@/lib/catalog/import-gallery");
const { getObject } = await import("@/lib/storage");

let folder = "";
let scans = "";
const suffix = String(Date.now()).slice(-3);
const code = (n: number) => `M-9${suffix}${n}`;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-"));
  fs.writeFileSync(path.join(folder, `${code(1)}.jpg`), await scannedJpeg(3200, 2400));
  fs.writeFileSync(path.join(folder, `${code(1)}-2.jpg`), await scannedJpeg(1200, 900, "#b5651d"));
  fs.writeFileSync(path.join(folder, `${code(2)}.png`), await sharp({ create: { width: 50, height: 40, channels: 3, background: "#123456" } }).png().toBuffer());
  fs.writeFileSync(path.join(folder, `${code(3)}.jpg`), Buffer.from("<html>no es imagen</html>"));
  fs.writeFileSync(path.join(folder, `${code(4)}.pdf`), await scannedPdf(["#2f5d3a", "#b5651d", "#333333"]));
  fs.writeFileSync(path.join(folder, "notas.txt"), "hola");
  // Escaneos con el nombre del escáner y un CSV que dice el orden.
  scans = fs.mkdtempSync(path.join(os.tmpdir(), "escaneos-"));
  fs.writeFileSync(path.join(scans, "Escaneo 001.pdf"), await scannedPdf(["#2f5d3a", "#b5651d"]));
  fs.writeFileSync(path.join(scans, "Escaneo 002.jpg"), await scannedJpeg(1600, 1200, "#333333"));
  fs.writeFileSync(path.join(scans, "orden.csv"), `codigo\n${code(5)}\n${code(6)}\n${code(6)}\n`);
});

afterAll(async () => {
  fs.rmSync(folder, { recursive: true, force: true });
  fs.rmSync(scans, { recursive: true, force: true });
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

describe("importación de fotos de la galería", () => {
  it("carga principal y adicional por código en WebP recortado con miniatura, valida el tipo real y no duplica al repetir", async () => {
    await testSql()`insert into public.gallery_samples (code, name, is_active) values (${code(1)}, 'Caja kraft con ventana', true)`;
    await testSql()`insert into public.gallery_samples (code, name, is_active) values (${code(4)}, 'Bolsa escaneada', true)`;

    const dry = await importGalleryFolder(folder, { dryRun: true });
    expect(dry.find((r) => r.file === `${code(1)}.jpg`)?.status).toBe("main");
    const [untouched] = await testSql()<{ photo_url: string | null }[]>`select photo_url from public.gallery_samples where code = ${code(1)}`;
    expect(untouched?.photo_url).toBeNull();

    const first = await importGalleryFolder(folder);
    const by = (file: string, page?: number) => first.find((r) => r.file === file && r.page === page);
    expect(by(`${code(1)}.jpg`)?.status).toBe("main");
    expect(by(`${code(1)}-2.jpg`)?.status).toBe("extra");
    expect(by(`${code(2)}.png`)).toMatchObject({ status: "skipped", reason: "missing" });
    expect(by(`${code(3)}.jpg`)).toMatchObject({ status: "skipped", reason: "type" });
    expect(by("notas.txt")).toMatchObject({ status: "skipped", reason: "name" });
    // PDF de 3 páginas: la primera es la principal.
    expect(by(`${code(4)}.pdf`, 1)?.status).toBe("main");
    expect(by(`${code(4)}.pdf`, 3)?.status).toBe("extra");

    const [row] = await testSql()<{ photo_url: string; photos: string[] }[]>`select photo_url, photos from public.gallery_samples where code = ${code(1)}`;
    expect(row?.photo_url).toMatch(/\/catalog\/gallery_samples\/[0-9a-f-]{36}\/import-[0-9a-f]{16}\.webp$/);
    expect(row?.photos).toHaveLength(1);
    const objectPath = row!.photo_url.split("/catalog/")[1]!;
    const stored = await getObject("catalog", objectPath);
    const meta = await sharp(stored!.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThan(1700); // se recortó el margen blanco (el escaneo medía 3200)
    const mini = await getObject("catalog", objectPath.replace(".webp", "-mini.webp"));
    expect((await sharp(mini!.data).metadata()).width).toBe(480);
    const [pdfRow] = await testSql()<{ photos: string[] }[]>`select photos from public.gallery_samples where code = ${code(4)}`;
    expect(pdfRow?.photos).toHaveLength(2);

    const again = await importGalleryFolder(folder);
    expect(again.find((r) => r.file === `${code(1)}.jpg`)?.status).toBe("unchanged");
    expect(again.find((r) => r.file === `${code(1)}-2.jpg`)?.status).toBe("unchanged");
    const [after] = await testSql()<{ photos: string[] }[]>`select photos from public.gallery_samples where code = ${code(1)}`;
    expect(after?.photos).toHaveLength(1);
  });

  it("con --crear, las muestras que faltan se crean inactivas y provisionales", async () => {
    const results = await importGalleryFolder(folder, { create: true });
    expect(results.find((r) => r.file === `${code(2)}.png`)?.status).toBe("created");
    const [created] = await testSql()<{ name: string; is_active: boolean; is_provisional: boolean; photo_url: string | null }[]>`
      select name, is_active, is_provisional, photo_url from public.gallery_samples where code = ${code(2)}`;
    expect(created).toMatchObject({ name: code(2), is_active: false, is_provisional: true });
    expect(created?.photo_url).toBeTruthy();
  });

  it("con --orden asigna los códigos en orden a las fotos de los escaneos", async () => {
    const results = await importGalleryFolder(scans, { create: true, order: path.join(scans, "orden.csv") });
    expect(results.map((r) => [r.file, r.page ?? null, r.code, r.status])).toEqual([
      ["Escaneo 001.pdf", 1, code(5), "created"],
      ["Escaneo 001.pdf", 2, code(6), "created"],
      ["Escaneo 002.jpg", null, code(6), "extra"],
    ]);
    const [six] = await testSql()<{ photo_url: string | null; photos: string[] }[]>`select photo_url, photos from public.gallery_samples where code = ${code(6)}`;
    expect(six?.photo_url).toBeTruthy();
    expect(six?.photos).toHaveLength(1);
  });
});
