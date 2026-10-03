/**
 * Plantillas CSV del catálogo real (Bloque 2): columnas, conversión de los
 * valores en español y validación. Lógica pura, sin base ni archivos; la
 * carga está en ./import-catalog.ts. Instrucciones para Mark en
 * docs/CATALOGO-COMO-LLENARLO.md.
 */
import { evaluateCaliber, evaluatePaper, type CompatRule } from "@/lib/compat";
import { normalizeHeader, type CsvRow } from "./csv";
import type { ProductCondition, Segment, SizeFamily } from "./entities";

// ---------------------------------------------------------------------------
// Columnas (encabezado tal como se escribe en el archivo)
// ---------------------------------------------------------------------------
export const CATALOG_HEADERS = [
  "clase",
  "código",
  "nombre",
  "descripción",
  "categoría",
  "tipo",
  "papel",
  "calibre",
  "tamaños",
  "familia",
  "acabados",
  "aptitud",
  "segmento",
  "usos típicos",
  "notas de fábrica",
  "archivo de foto",
  "barrera",
  "etiqueta simple",
  "gramaje g/m2",
  "puntos",
  "peso mín g",
  "peso máx g",
  "tintas",
  "pantone",
  "sin impresión",
  "sello en la web",
  "certificado",
  "permitido",
  "activo",
  "orden",
  "provisional",
] as const;

export const SAMPLE_HEADERS = [
  "código",
  "nombre",
  "descripción",
  "tipo",
  "papel",
  "acabados",
  "segmento",
  "etiquetas",
  "cliente anterior",
  "notas de fábrica",
  "archivo de foto",
  "activo",
  "orden",
  "provisional",
] as const;

// ---------------------------------------------------------------------------
// Clases y su tabla
// ---------------------------------------------------------------------------
export const CLASSES = {
  categoria: "categories",
  tipo: "product_types",
  tamano: "standard_sizes",
  papel: "papers",
  calibre: "calibers",
  impresion: "print_options",
  acabado: "finishes",
  atributo_ambiental: "eco_attributes",
  aptitud_alimentaria: "food_attributes",
} as const;
export type ClassKey = keyof typeof CLASSES | "regla";
export type CatalogTable = (typeof CLASSES)[keyof typeof CLASSES];

/** Nombre de cada clase como se escribe en el CSV. */
export const CLASS_LABEL: Record<ClassKey, string> = {
  categoria: "categoría",
  tipo: "tipo",
  tamano: "tamaño",
  papel: "papel",
  calibre: "calibre",
  impresion: "impresión",
  acabado: "acabado",
  atributo_ambiental: "atributo ambiental",
  aptitud_alimentaria: "aptitud alimentaria",
  regla: "regla",
};

const CODE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
const SAMPLE_CODE = /^M-\d{3,5}$/;

const SEGMENT_WORDS: Record<string, Segment> = { comercial: "commercial", alimentario: "food", alimentaria: "food", alimentos: "food" };
const SEGMENT_LABEL: Record<Segment, string> = { commercial: "comercial", food: "alimentario" };
const FAMILY_WORDS: Record<string, SizeFamily> = { caja: "box", bolsa: "bag", caja_de_alimentos: "food_box", alimentos: "food_box", alimentaria: "food_box" };
const FAMILY_LABEL: Record<SizeFamily, string> = { box: "caja", bag: "bolsa", food_box: "caja de alimentos" };
const CONDITION_WORDS: Record<string, ProductCondition> = { caliente: "hot", frio: "cold", grasa: "grease", fragil: "fragile", liquido: "liquid" };
const CONDITION_LABEL: Record<ProductCondition, string> = { hot: "caliente", cold: "frío", grease: "grasa", fragile: "frágil", liquid: "líquido" };

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------
export type CatalogEntry = {
  line: number;
  file: string;
  cls: Exclude<ClassKey, "regla">;
  code: string;
  name: string;
  description: string | null;
  factoryNotes: string | null;
  photos: string[];
  isActive: boolean;
  isProvisional: boolean;
  sortOrder: number | null;
  // Por clase
  categoryCode?: string;
  segments?: Segment[];
  family?: SizeFamily;
  typicalUses?: string[];
  allowedPapers?: string[];
  allowedCalibers?: string[];
  dims?: [number, number, number];
  isBarrier?: boolean;
  conditions?: ProductCondition[];
  simpleLabel?: string | null;
  grammage?: number | null;
  points?: number | null;
  minWeight?: number | null;
  maxWeight?: number | null;
  inkCount?: number | null;
  requiresPantone?: boolean;
  isNoPrint?: boolean;
  showBadge?: boolean;
  certificateUrl?: string | null;
};

export type RuleEntry = {
  line: number;
  file: string;
  typeCode: string;
  paperCode: string | null;
  caliberCode: string | null;
  allowed: boolean;
  reason: string | null;
  isActive: boolean;
  isProvisional: boolean;
  /** Regla que sale de las listas de papeles o calibres de una fila de tipo. */
  fromTypeRow: boolean;
};

export type SampleEntry = {
  line: number;
  file: string;
  code: string;
  name: string;
  description: string | null;
  typeCode: string | null;
  paperCode: string | null;
  finishCodes: string[];
  segments: Segment[];
  tags: string[];
  previousClient: string | null;
  factoryNotes: string | null;
  photos: string[];
  isActive: boolean;
  isProvisional: boolean;
  sortOrder: number | null;
};

export type Issue = { file: string; line: number | null; code: string | null; message: string };

/** Lo que ya está en la base, por código (lo que el CSV no trae se deja igual). */
export type CatalogSnapshot = {
  codes: Record<CatalogTable, Map<string, { isActive: boolean }>>;
  samples: Set<string>;
  rules: { typeCode: string; paperCode: string | null; caliberCode: string | null; allowed: boolean; reason: string | null; isActive: boolean }[];
};

// ---------------------------------------------------------------------------
// Conversión de celdas
// ---------------------------------------------------------------------------
const list = (value: string | undefined): string[] =>
  (value ?? "")
    .split(/[|;,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);

const textOrNull = (value: string | undefined): string | null => (value && value.trim() ? value.trim() : null);

class RowReader {
  constructor(
    private readonly row: CsvRow,
    private readonly file: string,
    private readonly code: string | null,
    private readonly issues: Issue[],
  ) {}

  private fail(message: string) {
    this.issues.push({ file: this.file, line: this.row.line, code: this.code, message });
  }

  get(key: string): string {
    return this.row.values[key] ?? "";
  }

  bool(key: string, label: string, fallback: boolean): boolean {
    const v = normalizeHeader(this.get(key));
    if (v === "") return fallback;
    if (["si", "s", "x", "true", "1", "yes"].includes(v)) return true;
    if (["no", "n", "false", "0"].includes(v)) return false;
    this.fail(`"${label}" debe ser sí o no (dice "${this.get(key)}").`);
    return fallback;
  }

  number(key: string, label: string, opts: { integer?: boolean; min?: number; max?: number } = {}): number | null {
    const raw = this.get(key).replace(/\s/g, "");
    if (raw === "") return null;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || (opts.integer && !Number.isInteger(n)) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
      this.fail(`"${label}" no es un número válido (dice "${this.get(key)}").`);
      return null;
    }
    return n;
  }

  words<T extends string>(key: string, label: string, map: Record<string, T>, options: string): T[] {
    const out: T[] = [];
    for (const word of list(this.get(key))) {
      const v = map[normalizeHeader(word)];
      if (v) {
        if (!out.includes(v)) out.push(v);
      } else this.fail(`"${label}": no se reconoce "${word}". Valores posibles: ${options}.`);
    }
    return out;
  }

  codes(key: string): string[] {
    return list(this.get(key)).map((c) => c.toUpperCase());
  }
}

function parseDims(value: string): [number, number, number] | null {
  const parts = value
    .toLowerCase()
    .replace(/cm/g, "")
    .split(/\s*[x×*]\s*/)
    .map((p) => Number(p.trim().replace(",", ".")));
  return parts.length === 3 && parts.every((n) => Number.isFinite(n) && n > 0 && n <= 1000) ? (parts as [number, number, number]) : null;
}

// ---------------------------------------------------------------------------
// Lectura de los CSV
// ---------------------------------------------------------------------------
export function readCatalogRows(file: string, rows: readonly CsvRow[], issues: Issue[]): { entries: CatalogEntry[]; rules: RuleEntry[] } {
  const entries: CatalogEntry[] = [];
  const rules: RuleEntry[] = [];
  const classByWord = new Map<string, ClassKey>(Object.entries(CLASS_LABEL).map(([k, label]) => [normalizeHeader(label), k as ClassKey]));
  for (const row of rows) {
    const rawClass = row.values.clase ?? "";
    const cls = classByWord.get(normalizeHeader(rawClass));
    const code = (row.values.codigo ?? "").trim().toUpperCase();
    const r = new RowReader(row, file, code || null, issues);
    if (!cls) {
      issues.push({ file, line: row.line, code: code || null, message: `Clase desconocida "${rawClass}". Usa: ${Object.values(CLASS_LABEL).join(", ")}.` });
      continue;
    }
    const isActive = r.bool("activo", "activo", true);
    if (cls === "regla") {
      const typeCode = r.get("tipo").trim().toUpperCase();
      const paperCode = textOrNull(r.get("papel"))?.toUpperCase() ?? null;
      const caliberCode = textOrNull(r.get("calibre"))?.toUpperCase() ?? null;
      if (!typeCode) issues.push({ file, line: row.line, code: null, message: "La regla no dice a qué tipo aplica (columna tipo)." });
      if (!paperCode && !caliberCode) issues.push({ file, line: row.line, code: typeCode || null, message: "La regla necesita un papel, un calibre o los dos." });
      if (!r.get("permitido").trim()) issues.push({ file, line: row.line, code: typeCode || null, message: 'La regla necesita "permitido": sí (solo con esto) o no (nunca con esto).' });
      rules.push({ line: row.line, file, typeCode, paperCode, caliberCode, allowed: r.bool("permitido", "permitido", true), reason: textOrNull(r.get("descripcion")), isActive, isProvisional: r.bool("provisional", "provisional", false), fromTypeRow: false });
      continue;
    }
    if (!CODE.test(code) || code.length > 20) {
      issues.push({ file, line: row.line, code: code || null, message: code ? `Código "${code}" inválido: solo mayúsculas, números y guiones, hasta 20 caracteres.` : "Falta el código." });
      continue;
    }
    const name = r.get("nombre").trim();
    if (!name) issues.push({ file, line: row.line, code, message: "Falta el nombre." });
    const entry: CatalogEntry = {
      line: row.line,
      file,
      cls,
      code,
      name,
      description: textOrNull(r.get("descripcion")),
      factoryNotes: textOrNull(r.get("notas_de_fabrica")),
      photos: list(r.get("archivo_de_foto")),
      isActive,
      isProvisional: r.bool("provisional", "provisional", false),
      sortOrder: r.number("orden", "orden", { integer: true, min: 0, max: 100000 }),
    };
    if (cls !== "tipo" && entry.photos.length > 1) issues.push({ file, line: row.line, code, message: `Un ${CLASS_LABEL[cls]} lleva una sola foto (hay ${entry.photos.length}).` });
    switch (cls) {
      case "tipo": {
        entry.categoryCode = r.get("categoria").trim().toUpperCase();
        if (!entry.categoryCode) issues.push({ file, line: row.line, code, message: "Falta la categoría del tipo." });
        entry.segments = r.words("segmento", "segmento", SEGMENT_WORDS, "comercial, alimentario");
        if (entry.segments.length === 0) issues.push({ file, line: row.line, code, message: "Falta el segmento: comercial, alimentario o los dos." });
        const [family] = r.words("familia", "familia", FAMILY_WORDS, "caja, bolsa, caja de alimentos");
        if (!family) issues.push({ file, line: row.line, code, message: "Falta la familia de tamaños: caja, bolsa o caja de alimentos." });
        entry.family = family;
        entry.typicalUses = list(r.get("usos_tipicos"));
        entry.allowedPapers = r.codes("papel");
        entry.allowedCalibers = r.codes("calibre");
        for (const paperCode of entry.allowedPapers)
          rules.push({ line: row.line, file, typeCode: code, paperCode, caliberCode: null, allowed: true, reason: null, isActive: true, isProvisional: entry.isProvisional, fromTypeRow: true });
        for (const caliberCode of entry.allowedCalibers)
          rules.push({ line: row.line, file, typeCode: code, paperCode: null, caliberCode, allowed: true, reason: null, isActive: true, isProvisional: entry.isProvisional, fromTypeRow: true });
        break;
      }
      case "tamano": {
        const [family] = r.words("familia", "familia", FAMILY_WORDS, "caja, bolsa, caja de alimentos");
        if (!family) issues.push({ file, line: row.line, code, message: "Falta la familia del tamaño: caja, bolsa o caja de alimentos." });
        entry.family = family;
        const dims = parseDims(r.get("tamanos"));
        if (!dims) issues.push({ file, line: row.line, code, message: `Medidas inválidas "${r.get("tamanos")}": escribe largo x ancho x alto en cm, por ejemplo 20 x 15 x 8.` });
        else entry.dims = dims;
        break;
      }
      case "papel":
        entry.isBarrier = r.bool("barrera", "barrera", false);
        entry.conditions = r.words("aptitud", "aptitud", CONDITION_WORDS, "caliente, frío, grasa, frágil, líquido");
        break;
      case "calibre":
        entry.simpleLabel = textOrNull(r.get("etiqueta_simple"));
        entry.grammage = r.number("gramaje_g_m2", "gramaje", { min: 1, max: 5000 });
        entry.points = r.number("puntos", "puntos", { min: 1, max: 1000 });
        entry.minWeight = r.number("peso_min_g", "peso mín", { integer: true, min: 0, max: 10_000_000 });
        entry.maxWeight = r.number("peso_max_g", "peso máx", { integer: true, min: 1, max: 10_000_000 });
        if (entry.minWeight != null && entry.maxWeight != null && entry.minWeight >= entry.maxWeight)
          issues.push({ file, line: row.line, code, message: "El peso mínimo debe ser menor que el máximo." });
        break;
      case "impresion":
        entry.inkCount = r.number("tintas", "tintas", { integer: true, min: 0, max: 20 });
        entry.requiresPantone = r.bool("pantone", "pantone", false);
        entry.isNoPrint = r.bool("sin_impresion", "sin impresión", false);
        break;
      case "atributo_ambiental":
        entry.showBadge = r.bool("sello_en_la_web", "sello en la web", false);
        entry.certificateUrl = textOrNull(r.get("certificado"));
        if (entry.certificateUrl && !/^https:\/\/\S+$/.test(entry.certificateUrl))
          issues.push({ file, line: row.line, code, message: "El certificado debe ser un enlace que empiece con https://." });
        break;
      case "aptitud_alimentaria":
        entry.conditions = r.words("aptitud", "aptitud", CONDITION_WORDS, "caliente, frío, grasa, frágil, líquido");
        break;
      default:
        break;
    }
    entries.push(entry);
  }
  return { entries, rules };
}

export function readSampleRows(file: string, rows: readonly CsvRow[], issues: Issue[]): SampleEntry[] {
  const out: SampleEntry[] = [];
  for (const row of rows) {
    const code = (row.values.codigo ?? "").trim().toUpperCase();
    const r = new RowReader(row, file, code || null, issues);
    if (!SAMPLE_CODE.test(code)) {
      issues.push({ file, line: row.line, code: code || null, message: code ? `Código de muestra "${code}" inválido: debe ser M- y 3 a 5 números (M-001).` : "Falta el código." });
      continue;
    }
    const name = r.get("nombre").trim();
    if (!name) issues.push({ file, line: row.line, code, message: "Falta el nombre." });
    out.push({
      line: row.line,
      file,
      code,
      name,
      description: textOrNull(r.get("descripcion")),
      typeCode: textOrNull(r.get("tipo"))?.toUpperCase() ?? null,
      paperCode: textOrNull(r.get("papel"))?.toUpperCase() ?? null,
      finishCodes: r.codes("acabados"),
      segments: r.words("segmento", "segmento", SEGMENT_WORDS, "comercial, alimentario"),
      tags: list(r.get("etiquetas")),
      previousClient: textOrNull(r.get("cliente_anterior")),
      factoryNotes: textOrNull(r.get("notas_de_fabrica")),
      photos: list(r.get("archivo_de_foto")),
      isActive: r.bool("activo", "activo", true),
      isProvisional: r.bool("provisional", "provisional", false),
      sortOrder: r.number("orden", "orden", { integer: true, min: 0, max: 100000 }),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Validación cruzada
// ---------------------------------------------------------------------------
export type Plan = {
  entries: CatalogEntry[];
  /** Reglas finales de cada tipo que trae el CSV (las demás quedan inactivas). */
  rules: RuleEntry[];
  samples: SampleEntry[];
  issues: Issue[];
  warnings: string[];
};

export function validatePlan(
  input: { entries: CatalogEntry[]; rules: RuleEntry[]; samples: SampleEntry[] },
  snapshot: CatalogSnapshot,
  photoExists: (name: string) => boolean,
  issues: Issue[],
): Plan {
  const warnings: string[] = [];
  const { entries, samples } = input;

  // Códigos únicos en todo el archivo (también entre clases distintas).
  const byCode = new Map<string, CatalogEntry>();
  for (const e of entries) {
    const prev = byCode.get(e.code);
    if (prev) issues.push({ file: e.file, line: e.line, code: e.code, message: `Código repetido: ya está en la fila ${prev.line} (${CLASS_LABEL[prev.cls]}).` });
    else byCode.set(e.code, e);
  }
  const sampleByCode = new Map<string, SampleEntry>();
  for (const s of samples) {
    const prev = sampleByCode.get(s.code);
    if (prev) issues.push({ file: s.file, line: s.line, code: s.code, message: `Código repetido: ya está en la fila ${prev.line}.` });
    else sampleByCode.set(s.code, s);
  }

  // Estado final por tabla: lo del CSV manda; lo demás, como está en la base.
  const finalActive = (table: CatalogTable, code: string): boolean | null => {
    const e = byCode.get(code);
    if (e && CLASSES[e.cls] === table) return e.isActive;
    const db = snapshot.codes[table].get(code);
    return db ? db.isActive : null;
  };
  const exists = (table: CatalogTable, code: string) => finalActive(table, code) !== null;
  const where = (table: CatalogTable) => `en el CSV ni en el catálogo (${CLASS_LABEL[(Object.keys(CLASSES) as (keyof typeof CLASSES)[]).find((k) => CLASSES[k] === table)!]})`;

  for (const e of entries) {
    if (e.cls === "tipo" && e.categoryCode && !exists("categories", e.categoryCode))
      issues.push({ file: e.file, line: e.line, code: e.code, message: `La categoría "${e.categoryCode}" no existe ${where("categories")}.` });
    for (const photo of e.photos) if (!photoExists(photo)) issues.push({ file: e.file, line: e.line, code: e.code, message: `No está la foto "${photo}" en la carpeta de fotos.` });
  }

  // Reglas: referencias y contradicciones.
  const ruleKey = (r: { typeCode: string; paperCode: string | null; caliberCode: string | null }) => `${r.typeCode}|${r.paperCode ?? ""}|${r.caliberCode ?? ""}`;
  const finalRules = new Map<string, RuleEntry>();
  for (const rule of input.rules) {
    let ok = true;
    if (rule.typeCode && !exists("product_types", rule.typeCode)) {
      issues.push({ file: rule.file, line: rule.line, code: rule.typeCode, message: `El tipo "${rule.typeCode}" no existe ${where("product_types")}.` });
      ok = false;
    }
    if (rule.paperCode && !exists("papers", rule.paperCode)) {
      issues.push({ file: rule.file, line: rule.line, code: rule.typeCode, message: `El papel "${rule.paperCode}" no existe ${where("papers")}.` });
      ok = false;
    }
    if (rule.caliberCode && !exists("calibers", rule.caliberCode)) {
      issues.push({ file: rule.file, line: rule.line, code: rule.typeCode, message: `El calibre "${rule.caliberCode}" no existe ${where("calibers")}.` });
      ok = false;
    }
    if (!ok || !rule.typeCode || (!rule.paperCode && !rule.caliberCode)) continue;
    const key = ruleKey(rule);
    const prev = finalRules.get(key);
    if (prev && prev.isActive && rule.isActive && prev.allowed !== rule.allowed) {
      issues.push({
        file: rule.file,
        line: rule.line,
        code: rule.typeCode,
        message: `Regla contradictoria: la fila ${prev.line} dice que ${rule.paperCode ?? ""}${rule.paperCode && rule.caliberCode ? " + " : ""}${rule.caliberCode ?? ""} ${prev.allowed ? "sí" : "no"} va con ${rule.typeCode}, y esta dice lo contrario.`,
      });
      continue;
    }
    // Una regla escrita (con motivo) gana a la que sale de la lista del tipo.
    if (!prev || prev.fromTypeRow) finalRules.set(key, rule);
  }

  // Tipos que trae el CSV: sus reglas son las del CSV. Los demás conservan las de la base.
  const csvTypes = new Set(entries.filter((e) => e.cls === "tipo").map((e) => e.code));
  for (const rule of input.rules) if (rule.typeCode) csvTypes.add(rule.typeCode);
  const effective: CompatRule[] = [
    ...snapshot.rules.filter((r) => !csvTypes.has(r.typeCode)).map((r) => ({ productTypeId: r.typeCode, paperId: r.paperCode, caliberId: r.caliberCode, allowed: r.allowed, reason: r.reason, isActive: r.isActive })),
    ...[...finalRules.values()].map((r) => ({ productTypeId: r.typeCode, paperId: r.paperCode, caliberId: r.caliberCode, allowed: r.allowed, reason: r.reason, isActive: r.isActive })),
  ];
  const activeCodes = (table: CatalogTable) => {
    const codes = new Set<string>();
    for (const [code, v] of snapshot.codes[table]) if (v.isActive) codes.add(code);
    for (const e of entries) {
      if (CLASSES[e.cls] !== table) continue;
      if (e.isActive) codes.add(e.code);
      else codes.delete(e.code);
    }
    return [...codes];
  };
  const papers = activeCodes("papers");
  const calibers = activeCodes("calibers");

  // Cada tipo activo del CSV tiene al menos una combinación papel + calibre posible.
  for (const e of entries.filter((x) => x.cls === "tipo" && x.isActive)) {
    const okPapers = papers.filter((p) => evaluatePaper(effective, e.code, p).allowed);
    if (okPapers.length === 0) {
      issues.push({ file: e.file, line: e.line, code: e.code, message: "Con las reglas de compatibilidad, este tipo no tiene ningún papel activo permitido: no se podría cotizar." });
      continue;
    }
    if (!okPapers.some((p) => calibers.some((c) => evaluateCaliber(effective, e.code, p, c).allowed)))
      issues.push({ file: e.file, line: e.line, code: e.code, message: "Con las reglas de compatibilidad, ningún calibre activo sirve con los papeles permitidos de este tipo." });
    for (const p of e.allowedPapers ?? []) if (finalActive("papers", p) === false) warnings.push(`${e.code}: el papel permitido ${p} está inactivo.`);
  }

  // Muestras.
  for (const s of samples) {
    if (s.typeCode && !exists("product_types", s.typeCode)) issues.push({ file: s.file, line: s.line, code: s.code, message: `El tipo "${s.typeCode}" no existe ${where("product_types")}.` });
    if (s.paperCode && !exists("papers", s.paperCode)) issues.push({ file: s.file, line: s.line, code: s.code, message: `El papel "${s.paperCode}" no existe ${where("papers")}.` });
    for (const f of s.finishCodes) if (!exists("finishes", f)) issues.push({ file: s.file, line: s.line, code: s.code, message: `El acabado "${f}" no existe ${where("finishes")}.` });
    if (s.typeCode && s.paperCode && exists("product_types", s.typeCode) && exists("papers", s.paperCode)) {
      const decision = evaluatePaper(effective, s.typeCode, s.paperCode);
      if (!decision.allowed) issues.push({ file: s.file, line: s.line, code: s.code, message: `Las reglas no permiten el papel ${s.paperCode} con el tipo ${s.typeCode}: corrige la muestra o la regla.` });
    }
    for (const photo of s.photos) if (!photoExists(photo)) issues.push({ file: s.file, line: s.line, code: s.code, message: `No está la foto "${photo}" en la carpeta de fotos.` });
  }

  const provisional = entries.filter((e) => e.isProvisional).length + samples.filter((s) => s.isProvisional).length;
  if (provisional > 0) warnings.push(`${provisional} filas siguen marcadas como PROVISIONAL (columna provisional = sí). Cámbialas a "no" cuando las confirmes.`);

  return { entries, rules: [...finalRules.values()], samples, issues, warnings };
}

// ---------------------------------------------------------------------------
// Exportación (plantillas prellenadas)
// ---------------------------------------------------------------------------
const yes = (v: boolean | null | undefined) => (v ? "sí" : "no");
const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

export type ExportRow = Record<string, string>;

export function catalogRow(values: Partial<Record<(typeof CATALOG_HEADERS)[number], string>>): string[] {
  return CATALOG_HEADERS.map((h) => values[h] ?? "");
}

export function sampleRow(values: Partial<Record<(typeof SAMPLE_HEADERS)[number], string>>): string[] {
  return SAMPLE_HEADERS.map((h) => values[h] ?? "");
}

export const labels = {
  yes,
  num,
  segments: (s: readonly Segment[]) => s.map((x) => SEGMENT_LABEL[x]).join(" | "),
  family: (f: SizeFamily) => FAMILY_LABEL[f],
  conditions: (c: readonly ProductCondition[]) => c.map((x) => CONDITION_LABEL[x]).join(" | "),
  list: (items: readonly string[]) => items.join(" | "),
};
