import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { serviceActor, withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { publicUrl, putObject } from "@/lib/storage";
import {
  CATALOG_HEADERS,
  catalogRow,
  CLASS_LABEL,
  CLASSES,
  labels,
  readCatalogRows,
  readSampleRows,
  SAMPLE_HEADERS,
  sampleRow,
  validatePlan,
  type CatalogEntry,
  type CatalogSnapshot,
  type CatalogTable,
  type Issue,
  type Plan,
  type SampleEntry,
} from "./catalog-csv";
import { parseCsv, toCsv } from "./csv";
import type { ProductCondition, Segment, SizeFamily } from "./entities";
import { processPhoto, scanImages } from "./photos";

/**
 * `pnpm catalog:import` (Bloque 2): valida las plantillas CSV y carga o
 * actualiza el catálogo por código. Nunca borra filas ni toca solicitudes:
 * lo que no está en el CSV queda como está, y lo que se quita se marca
 * "activo = no". Si hay un solo error no se carga nada.
 */
const TABLES = Object.values(CLASSES) as CatalogTable[];

export async function loadSnapshot(): Promise<CatalogSnapshot> {
  return withActor(serviceActor, async (tx) => {
    const codes = {} as CatalogSnapshot["codes"];
    for (const table of TABLES) {
      const rows = await tx<{ code: string; is_active: boolean }[]>`select code, is_active from ${tx("public." + table)}`;
      codes[table] = new Map(rows.map((r) => [r.code, { isActive: r.is_active }]));
    }
    const samples = new Set((await tx<{ code: string }[]>`select code from public.gallery_samples`).map((r) => r.code));
    const rules = await tx<{ type_code: string; paper_code: string | null; caliber_code: string | null; allowed: boolean; reason: string | null; is_active: boolean }[]>`
      select t.code as type_code, p.code as paper_code, c.code as caliber_code, r.allowed, r.reason, r.is_active
        from public.compatibilities r
        join public.product_types t on t.id = r.product_type_id
        left join public.papers p on p.id = r.paper_id
        left join public.calibers c on c.id = r.caliber_id`;
    return {
      codes,
      samples,
      rules: rules.map((r) => ({ typeCode: r.type_code, paperCode: r.paper_code, caliberCode: r.caliber_code, allowed: r.allowed, reason: r.reason, isActive: r.is_active })),
    };
  });
}

export type ImportReport = {
  issues: Issue[];
  warnings: string[];
  created: number;
  updated: number;
  rules: number;
  photos: number;
  applied: boolean;
};

/** Lee uno o más CSV (catálogo y muestras; se reconocen por sus columnas). */
export function readFiles(files: readonly string[], issues: Issue[]): { entries: CatalogEntry[]; rules: Plan["rules"]; samples: SampleEntry[] } {
  const entries: CatalogEntry[] = [];
  const rules: Plan["rules"] = [];
  const samples: SampleEntry[] = [];
  for (const file of files) {
    const name = path.basename(file);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      issues.push({ file: name, line: null, code: null, message: "No se pudo abrir el archivo." });
      continue;
    }
    const { headers, rows } = parseCsv(text);
    if (headers.includes("clase")) {
      const read = readCatalogRows(name, rows, issues);
      entries.push(...read.entries);
      rules.push(...read.rules);
    } else if (headers.includes("codigo")) samples.push(...readSampleRows(name, rows, issues));
    else issues.push({ file: name, line: 1, code: null, message: 'No parece una plantilla: falta la columna "código" (y "clase" en la del catálogo).' });
  }
  return { entries, rules, samples };
}

export async function importCatalog(files: readonly string[], opts: { photosDir: string; dryRun?: boolean }): Promise<ImportReport> {
  const issues: Issue[] = [];
  const read = readFiles(files, issues);
  const snapshot = await loadSnapshot();
  const photoExists = (name: string) => !name.includes("..") && fs.existsSync(path.join(opts.photosDir, name));
  const plan = validatePlan(read, snapshot, photoExists, issues);
  issues.sort((x, y) => x.file.localeCompare(y.file) || (x.line ?? 0) - (y.line ?? 0));
  const exists = (e: CatalogEntry) => snapshot.codes[CLASSES[e.cls]].has(e.code);
  const created = plan.entries.filter((e) => !exists(e)).length + plan.samples.filter((s) => !snapshot.samples.has(s.code)).length;
  const updated = plan.entries.length + plan.samples.length - created;
  const photoCount = [...plan.entries, ...plan.samples].reduce((n, e) => n + e.photos.length, 0);
  const base = { issues, warnings: plan.warnings, created, updated, rules: plan.rules.length, photos: photoCount };
  if (issues.length > 0 || opts.dryRun) return { ...base, applied: false };

  // Fotos primero (fuera de la transacción): WebP + miniatura, ruta por contenido.
  const photoUrls = new Map<string, string[]>();
  for (const item of [...plan.entries.map((e) => ({ table: CLASSES[e.cls] as string, code: e.code, photos: e.photos })), ...plan.samples.map((s) => ({ table: "gallery_samples", code: s.code, photos: s.photos }))]) {
    const urls: string[] = [];
    for (const name of item.photos) {
      const images = await scanImages(fs.readFileSync(path.join(opts.photosDir, name)), name);
      for (const image of images) {
        const prefix = `${item.table}/${item.code}/import-${createHash("sha256").update(image).digest("hex").slice(0, 16)}`;
        const photo = await processPhoto(image);
        await putObject("catalog", `${prefix}.webp`, photo.full, "image/webp");
        await putObject("catalog", `${prefix}-mini.webp`, photo.thumb, "image/webp");
        urls.push(publicUrl("catalog", `${prefix}.webp`));
      }
    }
    if (urls.length) photoUrls.set(`${item.table}:${item.code}`, urls);
  }

  await withActor(serviceActor, (tx) => applyPlan(tx, plan, photoUrls));
  return { ...base, applied: true };
}

const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "item";

async function uniqueSlug(tx: Tx, table: "categories" | "product_types", name: string, code: string): Promise<string> {
  const [current] = await tx<{ slug: string }[]>`select slug from ${tx("public." + table)} where code = ${code}`;
  if (current) return current.slug;
  const base = slugify(name);
  for (let n = 1; ; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await tx`select 1 from ${tx("public." + table)} where slug = ${slug}`;
    if (!taken) return slug;
  }
}

async function applyPlan(tx: Tx, plan: Plan, photoUrls: Map<string, string[]>): Promise<void> {
  const order: CatalogEntry["cls"][] = ["categoria", "tamano", "papel", "calibre", "impresion", "acabado", "atributo_ambiental", "aptitud_alimentaria", "tipo"];
  const idOf = async (table: CatalogTable, code: string) => (await tx<{ id: string }[]>`select id from ${tx("public." + table)} where code = ${code}`)[0]?.id ?? null;
  for (const cls of order) {
    for (const e of plan.entries.filter((x) => x.cls === cls)) {
      const table = CLASSES[cls];
      const values: Record<string, unknown> = {
        code: e.code,
        name: e.name,
        description: e.description,
        factory_notes: e.factoryNotes,
        is_active: e.isActive,
        is_provisional: e.isProvisional,
      };
      if (e.sortOrder !== null) values.sort_order = e.sortOrder;
      const urls = photoUrls.get(`${table}:${e.code}`);
      if (urls?.length) {
        values.photo_url = urls[0];
        if (cls === "tipo") values.photos = urls.slice(1);
      }
      if (cls === "categoria") values.slug = await uniqueSlug(tx, "categories", e.name, e.code);
      if (cls === "tipo") {
        values.slug = await uniqueSlug(tx, "product_types", e.name, e.code);
        values.category_id = await idOf("categories", e.categoryCode!);
        values.segments = e.segments as Segment[];
        values.size_family = e.family as SizeFamily;
        values.typical_uses = e.typicalUses ?? [];
      }
      if (cls === "tamano") {
        values.family = e.family;
        [values.length_cm, values.width_cm, values.height_cm] = e.dims!;
      }
      if (cls === "papel") {
        values.is_barrier = e.isBarrier;
        values.suggested_for_conditions = e.conditions as ProductCondition[];
      }
      if (cls === "aptitud_alimentaria") values.suggested_for_conditions = e.conditions as ProductCondition[];
      if (cls === "calibre") Object.assign(values, { simple_label: e.simpleLabel, grammage_gsm: e.grammage, points: e.points, min_weight_g: e.minWeight, max_weight_g: e.maxWeight });
      if (cls === "impresion") Object.assign(values, { ink_count: e.inkCount, requires_pantone: e.requiresPantone, is_no_print: e.isNoPrint });
      if (cls === "atributo_ambiental") Object.assign(values, { show_badge: e.showBadge, certificate_url: e.certificateUrl });
      await upsertTyped(tx, table, values);
    }
  }

  // Reglas de los tipos que trae el CSV: las del CSV quedan activas; las demás, inactivas.
  const types = new Set([...plan.entries.filter((e) => e.cls === "tipo").map((e) => e.code), ...plan.rules.map((r) => r.typeCode)]);
  for (const typeCode of types) {
    const typeId = await idOf("product_types", typeCode);
    if (!typeId) continue;
    await tx`update public.compatibilities set is_active = false where product_type_id = ${typeId}`;
    for (const r of plan.rules.filter((x) => x.typeCode === typeCode)) {
      const paperId = r.paperCode ? await idOf("papers", r.paperCode) : null;
      const caliberId = r.caliberCode ? await idOf("calibers", r.caliberCode) : null;
      const [existing] = await tx<{ id: string }[]>`
        select id from public.compatibilities
         where product_type_id = ${typeId} and paper_id is not distinct from ${paperId}::uuid and caliber_id is not distinct from ${caliberId}::uuid`;
      if (existing)
        await tx`update public.compatibilities set allowed = ${r.allowed}, reason = ${r.reason}, is_active = ${r.isActive}, is_provisional = ${r.isProvisional} where id = ${existing.id}`;
      else
        await tx`
          insert into public.compatibilities (product_type_id, paper_id, caliber_id, allowed, reason, is_active, is_provisional)
          values (${typeId}, ${paperId}, ${caliberId}, ${r.allowed}, ${r.reason}, ${r.isActive}, ${r.isProvisional})`;
    }
  }

  for (const s of plan.samples) {
    const finishIds: string[] = [];
    for (const f of s.finishCodes) {
      const id = await idOf("finishes", f);
      if (id) finishIds.push(id);
    }
    const values: Record<string, unknown> = {
      code: s.code,
      name: s.name,
      description: s.description,
      product_type_id: s.typeCode ? await idOf("product_types", s.typeCode) : null,
      paper_id: s.paperCode ? await idOf("papers", s.paperCode) : null,
      finish_ids: finishIds,
      segments: s.segments,
      tags: s.tags,
      previous_client: s.previousClient,
      factory_notes: s.factoryNotes,
      is_active: s.isActive,
      is_provisional: s.isProvisional,
    };
    if (s.sortOrder !== null) values.sort_order = s.sortOrder;
    const urls = photoUrls.get(`gallery_samples:${s.code}`);
    if (urls?.length) {
      values.photo_url = urls[0];
      values.photos = urls.slice(1);
    }
    await upsertTyped(tx, "gallery_samples", values);
  }
}

/** Upsert por código con los arreglos de enums casteados. */
async function upsertTyped(tx: Tx, table: string, values: Record<string, unknown>): Promise<void> {
  const enumCols: Record<string, string> = {
    segments: "public.segment[]",
    size_family: "public.size_family",
    family: "public.size_family",
    suggested_for_conditions: "public.product_condition[]",
    finish_ids: "uuid[]",
    photos: "text[]",
    tags: "text[]",
    typical_uses: "text[]",
  };
  const cols = Object.keys(values);
  const params: unknown[] = [];
  const exprs = cols.map((c) => {
    const v = values[c];
    params.push(Array.isArray(v) ? `{${v.map((x) => `"${String(x).replace(/(["\\])/g, "\\$1")}"`).join(",")}}` : v);
    return `$${params.length}${enumCols[c] ? `::${enumCols[c]}` : ""}`;
  });
  const quoted = cols.map((c) => `"${c}"`);
  const updates = cols.filter((c) => c !== "code").map((c) => `"${c}" = excluded."${c}"`);
  await tx.unsafe(`insert into public."${table}" (${quoted.join(", ")}) values (${exprs.join(", ")}) on conflict (code) do update set ${updates.join(", ")}`, params as never[]);
}

// ---------------------------------------------------------------------------
// Exportación: plantillas prellenadas con el catálogo actual
// ---------------------------------------------------------------------------
export async function exportTemplates(): Promise<{ catalog: string; samples: string }> {
  return withActor(serviceActor, async (tx) => {
    const rows: string[][] = [];
    const cats = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order from public.categories order by sort_order, code`;
    const common = (r: { code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number }) => ({
      código: r.code,
      nombre: r.name,
      descripción: r.description ?? "",
      "notas de fábrica": r.factory_notes ?? "",
      activo: labels.yes(r.is_active),
      orden: String(r.sort_order),
      provisional: labels.yes(r.is_provisional),
    });
    for (const r of cats) rows.push(catalogRow({ clase: CLASS_LABEL.categoria, ...common(r) }));

    const types = await tx<
      { code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; category: string; segments: Segment[]; size_family: SizeFamily; typical_uses: string[] }[]
    >`
      select t.code, t.name, t.description, t.factory_notes, t.is_active, t.is_provisional, t.sort_order, c.code as category, t.segments::text[] as segments, t.size_family::text as size_family, t.typical_uses
        from public.product_types t join public.categories c on c.id = t.category_id order by t.sort_order, t.code`;
    const rules = await tx<{ type_code: string; paper_code: string | null; caliber_code: string | null; allowed: boolean; reason: string | null; is_active: boolean; is_provisional: boolean }[]>`
      select t.code as type_code, p.code as paper_code, c.code as caliber_code, r.allowed, r.reason, r.is_active, r.is_provisional
        from public.compatibilities r join public.product_types t on t.id = r.product_type_id
        left join public.papers p on p.id = r.paper_id left join public.calibers c on c.id = r.caliber_id
       order by t.code, p.code nulls first, c.code nulls first`;
    // Listas simples en la fila del tipo: solo reglas "sí" sin motivo y de un solo eje.
    const simple = (r: (typeof rules)[number]) => r.allowed && r.is_active && !r.reason && (r.paper_code === null) !== (r.caliber_code === null);
    for (const t of types) {
      const own = rules.filter((r) => r.type_code === t.code && simple(r));
      rows.push(
        catalogRow({
          clase: CLASS_LABEL.tipo,
          ...common(t),
          categoría: t.category,
          segmento: labels.segments(t.segments),
          familia: labels.family(t.size_family),
          "usos típicos": labels.list(t.typical_uses),
          papel: labels.list(own.filter((r) => r.paper_code).map((r) => r.paper_code!)),
          calibre: labels.list(own.filter((r) => r.caliber_code).map((r) => r.caliber_code!)),
        }),
      );
    }

    const sizes = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; family: SizeFamily; length_cm: string; width_cm: string; height_cm: string }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order, family::text as family, length_cm, width_cm, height_cm from public.standard_sizes order by family, sort_order, code`;
    for (const s of sizes)
      rows.push(catalogRow({ clase: CLASS_LABEL.tamano, ...common(s), familia: labels.family(s.family), tamaños: `${labels.num(s.length_cm)} x ${labels.num(s.width_cm)} x ${labels.num(s.height_cm)}` }));

    const papers = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; is_barrier: boolean; conditions: ProductCondition[] }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order, is_barrier, suggested_for_conditions::text[] as conditions from public.papers order by sort_order, code`;
    for (const p of papers) rows.push(catalogRow({ clase: CLASS_LABEL.papel, ...common(p), barrera: labels.yes(p.is_barrier), aptitud: labels.conditions(p.conditions) }));

    const calibers = await tx<
      { code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; simple_label: string | null; grammage_gsm: string | null; points: string | null; min_weight_g: number | null; max_weight_g: number | null }[]
    >`select code, name, description, factory_notes, is_active, is_provisional, sort_order, simple_label, grammage_gsm, points, min_weight_g, max_weight_g from public.calibers order by sort_order, code`;
    for (const c of calibers)
      rows.push(
        catalogRow({
          clase: CLASS_LABEL.calibre,
          ...common(c),
          "etiqueta simple": c.simple_label ?? "",
          "gramaje g/m2": labels.num(c.grammage_gsm),
          puntos: labels.num(c.points),
          "peso mín g": labels.num(c.min_weight_g),
          "peso máx g": labels.num(c.max_weight_g),
        }),
      );

    const prints = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; ink_count: number | null; requires_pantone: boolean; is_no_print: boolean }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order, ink_count, requires_pantone, is_no_print from public.print_options order by sort_order, code`;
    for (const p of prints)
      rows.push(catalogRow({ clase: CLASS_LABEL.impresion, ...common(p), tintas: labels.num(p.ink_count), pantone: labels.yes(p.requires_pantone), "sin impresión": labels.yes(p.is_no_print) }));

    const finishes = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order from public.finishes order by sort_order, code`;
    for (const f of finishes) rows.push(catalogRow({ clase: CLASS_LABEL.acabado, ...common(f) }));

    const eco = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; show_badge: boolean; certificate_url: string | null }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order, show_badge, certificate_url from public.eco_attributes order by sort_order, code`;
    for (const a of eco) rows.push(catalogRow({ clase: CLASS_LABEL.atributo_ambiental, ...common(a), "sello en la web": labels.yes(a.show_badge), certificado: a.certificate_url ?? "" }));

    const food = await tx<{ code: string; name: string; description: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number; conditions: ProductCondition[] }[]>`
      select code, name, description, factory_notes, is_active, is_provisional, sort_order, suggested_for_conditions::text[] as conditions from public.food_attributes order by sort_order, code`;
    for (const a of food) rows.push(catalogRow({ clase: CLASS_LABEL.aptitud_alimentaria, ...common(a), aptitud: labels.conditions(a.conditions) }));

    for (const r of rules.filter((x) => !simple(x)))
      rows.push(
        catalogRow({
          clase: CLASS_LABEL.regla,
          tipo: r.type_code,
          papel: r.paper_code ?? "",
          calibre: r.caliber_code ?? "",
          permitido: labels.yes(r.allowed),
          descripción: r.reason ?? "",
          activo: labels.yes(r.is_active),
          provisional: labels.yes(r.is_provisional),
        }),
      );

    const samples = await tx<
      { code: string; name: string; description: string | null; type_code: string | null; paper_code: string | null; finishes: string[]; segments: Segment[]; tags: string[]; previous_client: string | null; factory_notes: string | null; is_active: boolean; is_provisional: boolean; sort_order: number }[]
    >`
      select s.code, s.name, s.description, t.code as type_code, p.code as paper_code,
             coalesce((select array_agg(f.code order by f.code) from public.finishes f where f.id = any (s.finish_ids)), '{}') as finishes,
             s.segments::text[] as segments, s.tags, s.previous_client, s.factory_notes, s.is_active, s.is_provisional, s.sort_order
        from public.gallery_samples s left join public.product_types t on t.id = s.product_type_id left join public.papers p on p.id = s.paper_id
       order by s.sort_order, s.code`;
    const sampleRows = samples.map((s) =>
      sampleRow({
        código: s.code,
        nombre: s.name,
        descripción: s.description ?? "",
        tipo: s.type_code ?? "",
        papel: s.paper_code ?? "",
        acabados: labels.list(s.finishes),
        segmento: labels.segments(s.segments),
        etiquetas: labels.list(s.tags),
        "cliente anterior": s.previous_client ?? "",
        "notas de fábrica": s.factory_notes ?? "",
        activo: labels.yes(s.is_active),
        orden: String(s.sort_order),
        provisional: labels.yes(s.is_provisional),
      }),
    );
    return { catalog: toCsv(CATALOG_HEADERS, rows), samples: toCsv(SAMPLE_HEADERS, sampleRows) };
  });
}
