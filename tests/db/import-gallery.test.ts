import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeTestSql, testSql } from "../support/db";

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { importGalleryFolder } = await import("@/lib/catalog/import-gallery");
const { getObject } = await import("@/lib/storage");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(64)]);

let folder = "";
const suffix = String(Date.now()).slice(-3);
const code = (n: number) => `M-9${suffix}${n}`;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "galeria-"));
  fs.writeFileSync(path.join(folder, `${code(1)}.png`), PNG);
  fs.writeFileSync(path.join(folder, `${code(1)}-2.jpg`), JPEG);
  fs.writeFileSync(path.join(folder, `${code(2)}.png`), PNG);
  fs.writeFileSync(path.join(folder, `${code(3)}.jpg`), Buffer.from("<html>no es imagen</html>"));
  fs.writeFileSync(path.join(folder, "notas.txt"), "hola");
});

afterAll(async () => {
  fs.rmSync(folder, { recursive: true, force: true });
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

describe("importación de fotos de la galería", () => {
  it("carga principal y adicional por código, valida el tipo real y no duplica al repetir", async () => {
    await testSql()`insert into public.gallery_samples (code, name, is_active) values (${code(1)}, 'Caja kraft con ventana', true)`;

    const dry = await importGalleryFolder(folder, { dryRun: true });
    expect(dry.find((r) => r.file === `${code(1)}.png`)?.status).toBe("main");
    const [untouched] = await testSql()<{ photo_url: string | null }[]>`select photo_url from public.gallery_samples where code = ${code(1)}`;
    expect(untouched?.photo_url).toBeNull();

    const first = await importGalleryFolder(folder);
    const by = (file: string) => first.find((r) => r.file === file);
    expect(by(`${code(1)}.png`)?.status).toBe("main");
    expect(by(`${code(1)}-2.jpg`)?.status).toBe("extra");
    expect(by(`${code(2)}.png`)).toMatchObject({ status: "skipped", reason: "missing" });
    expect(by(`${code(3)}.jpg`)).toMatchObject({ status: "skipped", reason: "type" });
    expect(by("notas.txt")).toMatchObject({ status: "skipped", reason: "name" });

    const [row] = await testSql()<{ photo_url: string; photos: string[] }[]>`select photo_url, photos from public.gallery_samples where code = ${code(1)}`;
    expect(row?.photo_url).toMatch(/\/catalog\/gallery_samples\/[0-9a-f-]{36}\/import-[0-9a-f]{16}\.png$/);
    expect(row?.photos).toHaveLength(1);
    const objectPath = row!.photo_url.split("/catalog/")[1]!;
    expect((await getObject("catalog", objectPath))?.data.equals(PNG)).toBe(true);

    const again = await importGalleryFolder(folder);
    expect(again.find((r) => r.file === `${code(1)}.png`)?.status).toBe("unchanged");
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
});
