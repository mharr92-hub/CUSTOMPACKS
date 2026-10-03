import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { closeTestSql, testSql } from "../support/db";
import { scannedJpeg, scannedPdf } from "../support/scan-fixtures";

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { exportTemplates, importCatalog } = await import("@/lib/catalog/import-catalog");
const { CATALOG_HEADERS, SAMPLE_HEADERS, catalogRow, sampleRow } = await import("@/lib/catalog/catalog-csv");
const { parseCsv, toCsv } = await import("@/lib/catalog/csv");
const { getObject } = await import("@/lib/storage");

let folder = "";
const tag = String(Date.now()).slice(-5);
const Z = (s: string) => `Z${tag}-${s}`;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "catalogo-"));
  fs.mkdirSync(path.join(folder, "fotos"));
});

afterAll(async () => {
  // Que no queden en los tests que cuentan el catálogo sembrado (master-data).
  await testSql()`delete from public.gallery_samples where code = ${"M-9" + tag.slice(-4)}`;
  for (const table of ["product_types", "standard_sizes", "papers", "calibers", "categories"])
    await testSql().unsafe(`delete from public."${table}" where code like $1`, [`Z${tag}-%`]);
  fs.rmSync(folder, { recursive: true, force: true });
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

const write = (name: string, text: string) => {
  const file = path.join(folder, name);
  fs.writeFileSync(file, text);
  return file;
};

describe("plantillas del catálogo (pnpm catalog:import)", () => {
  it("las plantillas prellenadas con el catálogo actual pasan la validación tal cual", async () => {
    const { catalog, samples } = await exportTemplates();
    expect(catalog.startsWith("﻿")).toBe(true);
    const parsed = parseCsv(catalog);
    expect(parsed.headers).toContain("archivo_de_foto");
    expect(parsed.rows.some((r) => r.values.clase === "regla")).toBe(true);
    expect(parsed.rows.find((r) => r.values.codigo === "CJ-01")?.values.provisional).toBe("sí");
    const report = await importCatalog([write("catalogo.csv", catalog), write("muestras.csv", samples)], { photosDir: path.join(folder, "fotos"), dryRun: true });
    expect(report.issues).toEqual([]);
    expect(report.applied).toBe(false);
    expect(report.warnings.join(" ")).toMatch(/PROVISIONAL/);
  });

  it("carga nuevos códigos con fotos de escaneo y reglas, sin tocar solicitudes; una segunda corrida actualiza", async () => {
    fs.writeFileSync(path.join(folder, "fotos", "tipo.jpg"), await scannedJpeg(2400, 1800));
    fs.writeFileSync(path.join(folder, "fotos", "muestra.pdf"), await scannedPdf(["#2f5d3a", "#b5651d"]));
    const [before] = await testSql()<{ n: number }[]>`select count(*)::int as n from public.quote_requests`;
    const catalog = toCsv(CATALOG_HEADERS, [
      catalogRow({ clase: "categoría", código: Z("CAT"), nombre: `Cajas de prueba ${tag}`, provisional: "no", orden: "99999" }),
      catalogRow({ clase: "papel", código: Z("PA"), nombre: "Kraft de prueba", aptitud: "grasa | frío", barrera: "sí", orden: "99999" }),
      catalogRow({ clase: "calibre", código: Z("CA"), nombre: "Medio de prueba", "gramaje g/m2": "300", "peso mín g": "0", "peso máx g": "800", orden: "99999" }),
      catalogRow({
        clase: "tipo",
        código: Z("TIPO"),
        nombre: `Caja de prueba ${tag}`,
        categoría: Z("CAT"),
        segmento: "comercial, alimentario",
        familia: "caja",
        papel: Z("PA"),
        "usos típicos": "Regalos | Eventos",
        "archivo de foto": "tipo.jpg",
        "notas de fábrica": "Troquel 12",
        orden: "99999",
      }),
      catalogRow({ clase: "tamaño", código: Z("S1"), nombre: "S1 prueba", familia: "caja", tamaños: "20 x 15,5 x 8", orden: "99999" }),
      catalogRow({ clase: "regla", tipo: Z("TIPO"), calibre: Z("CA"), permitido: "sí", descripción: "Solo calibre medio." }),
    ]);
    const samples = toCsv(SAMPLE_HEADERS, [
      sampleRow({ código: "M-9" + tag.slice(-4), nombre: "Muestra de prueba", tipo: Z("TIPO"), papel: Z("PA"), segmento: "comercial", "cliente anterior": "Cliente X", "archivo de foto": "muestra.pdf" }),
    ]);
    const files = [write("catalogo2.csv", catalog), write("muestras2.csv", samples)];
    const report = await importCatalog(files, { photosDir: path.join(folder, "fotos") });
    expect(report.issues).toEqual([]);
    expect(report.applied).toBe(true);
    expect(report.created).toBe(6);

    const [type] = await testSql()<{ slug: string; photo_url: string; segments: string[]; size_family: string; typical_uses: string[]; factory_notes: string; is_provisional: boolean }[]>`
      select slug, photo_url, segments::text[] as segments, size_family::text as size_family, typical_uses, factory_notes, is_provisional from public.product_types where code = ${Z("TIPO")}`;
    expect(type).toMatchObject({ segments: ["commercial", "food"], size_family: "box", typical_uses: ["Regalos", "Eventos"], factory_notes: "Troquel 12", is_provisional: false });
    expect(type?.slug).toBe(`caja-de-prueba-${tag}`);
    expect(type?.photo_url).toMatch(/\/import-[0-9a-f]{16}\.webp$/);
    const objectPath = type!.photo_url.split("/catalog/")[1]!;
    expect((await getObject("catalog", objectPath.replace(".webp", "-mini.webp")))?.data.length).toBeGreaterThan(0);

    const [size] = await testSql()<{ width_cm: string }[]>`select width_cm from public.standard_sizes where code = ${Z("S1")}`;
    expect(Number(size?.width_cm)).toBe(15.5);
    const rules = await testSql()<{ paper: string | null; caliber: string | null; allowed: boolean; reason: string | null }[]>`
      select p.code as paper, c.code as caliber, r.allowed, r.reason from public.compatibilities r
        join public.product_types t on t.id = r.product_type_id left join public.papers p on p.id = r.paper_id left join public.calibers c on c.id = r.caliber_id
       where t.code = ${Z("TIPO")} and r.is_active order by p.code nulls last`;
    expect(rules).toEqual([
      { paper: Z("PA"), caliber: null, allowed: true, reason: null },
      { paper: null, caliber: Z("CA"), allowed: true, reason: "Solo calibre medio." },
    ]);
    const [sample] = await testSql()<{ previous_client: string; photo_url: string; photos: string[] }[]>`
      select previous_client, photo_url, photos from public.gallery_samples where code = ${"M-9" + tag.slice(-4)}`;
    expect(sample?.previous_client).toBe("Cliente X");
    expect(sample?.photos).toHaveLength(1); // PDF de 2 páginas: principal + adicional

    // El rol anónimo no ve el cliente anterior.
    await expect(testSql().begin(async (tx) => {
      await tx`set local role anon`;
      await tx`select previous_client from public.gallery_samples limit 1`;
    })).rejects.toThrow(/permission denied/);

    // Segunda corrida: actualiza por código (sin duplicar) y quita la regla que ya no está.
    const catalog2 = catalog.replace("Kraft de prueba", "Kraft corregido").replace(/^regla,.*$/m, "");
    const again = await importCatalog([write("catalogo3.csv", catalog2)], { photosDir: path.join(folder, "fotos") });
    expect(again.issues).toEqual([]);
    const [paper] = await testSql()<{ name: string }[]>`select name from public.papers where code = ${Z("PA")}`;
    expect(paper?.name).toBe("Kraft corregido");
    const active = await testSql()`
      select 1 from public.compatibilities r join public.product_types t on t.id = r.product_type_id where t.code = ${Z("TIPO")} and r.is_active`;
    expect(active).toHaveLength(1);
    const [after] = await testSql()<{ n: number }[]>`select count(*)::int as n from public.quote_requests`;
    expect(after?.n).toBe(before?.n);
  });

  it("con errores no carga nada y dice fila y motivo", async () => {
    const catalog = toCsv(CATALOG_HEADERS, [
      catalogRow({ clase: "papel", código: Z("PB"), nombre: "Papel que no debe cargarse" }),
      catalogRow({ clase: "papel", código: Z("PB"), nombre: "Repetido" }),
      catalogRow({ clase: "tipo", código: Z("T2"), nombre: "Sin categoría", categoría: "NOEXISTE", segmento: "comercial", familia: "caja", "archivo de foto": "falta.jpg" }),
      catalogRow({ clase: "tipo", código: Z("T3"), nombre: "Sin papeles", categoría: "CAJ", segmento: "comercial", familia: "caja" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-01", permitido: "no" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-02", permitido: "no" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-03", permitido: "no" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-04", permitido: "no" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-05", permitido: "no" }),
      catalogRow({ clase: "regla", tipo: Z("T3"), papel: "PA-01", permitido: "sí" }),
      catalogRow({ clase: "tamaño", código: Z("S9"), nombre: "Mal medido", familia: "caja", tamaños: "20 por 15" }),
      catalogRow({ clase: "cosa", código: Z("X"), nombre: "?" }),
    ]);
    const samples = toCsv(SAMPLE_HEADERS, [sampleRow({ código: "M-1", nombre: "Código corto" }), sampleRow({ código: "M-0001", nombre: "Papel no permitido", tipo: "CJ-10", papel: "PA-01" })]);
    const report = await importCatalog([write("malo.csv", catalog), write("malo-muestras.csv", samples)], { photosDir: path.join(folder, "fotos") });
    expect(report.applied).toBe(false);
    const text = report.issues.map((i) => `${i.line}: ${i.message}`).join("\n");
    expect(text).toMatch(/Código repetido: ya está en la fila 2/);
    expect(text).toMatch(/La categoría "NOEXISTE" no existe/);
    expect(text).toMatch(/No está la foto "falta.jpg"/);
    expect(text).toMatch(/Regla contradictoria/);
    expect(text).toMatch(/Medidas inválidas/);
    expect(text).toMatch(/Clase desconocida "cosa"/);
    expect(text).toMatch(/Código de muestra "M-1" inválido/);
    expect(text).toMatch(/no permiten el papel PA-01 con el tipo CJ-10/);
    expect(await testSql()`select 1 from public.papers where code = ${Z("PB")}`).toHaveLength(0);
  });
});
