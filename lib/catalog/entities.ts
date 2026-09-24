/**
 * Definición declarativa de las entidades del catálogo para el panel
 * (listado, formulario y validación en servidor). Los textos (títulos y
 * etiquetas) están en messages/es.json > admin.catalog.
 */
export const SEGMENTS = ["commercial", "food"] as const;
export const CONDITIONS = ["hot", "cold", "grease", "fragile", "liquid"] as const;
export const SIZE_FAMILIES = ["box", "bag", "food_box"] as const;

export type Segment = (typeof SEGMENTS)[number];
export type ProductCondition = (typeof CONDITIONS)[number];
export type SizeFamily = (typeof SIZE_FAMILIES)[number];

export type EntityKey =
  | "categories"
  | "product_types"
  | "standard_sizes"
  | "papers"
  | "calibers"
  | "print_options"
  | "finishes"
  | "eco_attributes"
  | "food_attributes"
  | "gallery_samples";

export type FieldDef =
  | { name: string; type: "text"; required?: boolean; pattern?: string; maxLength?: number }
  | { name: string; type: "textarea"; required?: boolean; maxLength?: number }
  | { name: string; type: "number"; required?: boolean; integer?: boolean; min?: number; max?: number; step?: string }
  | { name: string; type: "boolean" }
  | { name: string; type: "enum"; options: readonly string[]; enumType: string; required?: boolean }
  | { name: string; type: "enum-multi"; options: readonly string[]; enumType: string }
  | { name: string; type: "ref"; ref: EntityKey; required?: boolean }
  | { name: string; type: "ref-multi"; ref: EntityKey }
  | { name: string; type: "lines" };

export type EntityDef = {
  key: EntityKey;
  slug: string;
  table: EntityKey;
  /** Admite fotos adicionales en la columna `photos`. */
  hasGallery: boolean;
  fields: readonly FieldDef[];
  /** Columnas extra (además de código y nombre) que se muestran en el listado. */
  listColumns: readonly string[];
};

const CODE_PATTERN = "^[A-Z0-9]+(-[A-Z0-9]+)*$";
const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";

const head: readonly FieldDef[] = [
  { name: "code", type: "text", required: true, pattern: CODE_PATTERN, maxLength: 20 },
  { name: "name", type: "text", required: true, maxLength: 160 },
  { name: "description", type: "textarea", maxLength: 2000 },
];

const tail: readonly FieldDef[] = [
  { name: "sort_order", type: "number", integer: true, min: 0, max: 100000 },
  { name: "is_active", type: "boolean" },
  { name: "is_provisional", type: "boolean" },
  { name: "affects_price", type: "boolean" },
  { name: "factory_notes", type: "textarea", maxLength: 2000 },
];

export const ENTITIES: Record<EntityKey, EntityDef> = {
  categories: {
    key: "categories",
    slug: "categorias",
    table: "categories",
    hasGallery: false,
    fields: [...head, { name: "slug", type: "text", required: true, pattern: SLUG_PATTERN, maxLength: 80 }, ...tail],
    listColumns: ["slug"],
  },
  product_types: {
    key: "product_types",
    slug: "tipos",
    table: "product_types",
    hasGallery: true,
    fields: [
      ...head,
      { name: "slug", type: "text", required: true, pattern: SLUG_PATTERN, maxLength: 80 },
      { name: "category_id", type: "ref", ref: "categories", required: true },
      { name: "segments", type: "enum-multi", options: SEGMENTS, enumType: "segment" },
      { name: "size_family", type: "enum", options: SIZE_FAMILIES, enumType: "size_family", required: true },
      { name: "typical_uses", type: "lines" },
      ...tail,
    ],
    listColumns: ["category_id", "segments"],
  },
  standard_sizes: {
    key: "standard_sizes",
    slug: "tamanos",
    table: "standard_sizes",
    hasGallery: false,
    fields: [
      ...head,
      { name: "family", type: "enum", options: SIZE_FAMILIES, enumType: "size_family", required: true },
      { name: "length_cm", type: "number", required: true, min: 0.1, max: 1000, step: "0.1" },
      { name: "width_cm", type: "number", required: true, min: 0.1, max: 1000, step: "0.1" },
      { name: "height_cm", type: "number", required: true, min: 0.1, max: 1000, step: "0.1" },
      ...tail,
    ],
    listColumns: ["family", "length_cm", "width_cm", "height_cm"],
  },
  papers: {
    key: "papers",
    slug: "papeles",
    table: "papers",
    hasGallery: false,
    fields: [
      ...head,
      { name: "is_barrier", type: "boolean" },
      { name: "suggested_for_conditions", type: "enum-multi", options: CONDITIONS, enumType: "product_condition" },
      ...tail,
    ],
    listColumns: ["is_barrier"],
  },
  calibers: {
    key: "calibers",
    slug: "calibres",
    table: "calibers",
    hasGallery: false,
    fields: [
      ...head,
      { name: "simple_label", type: "text", maxLength: 160 },
      { name: "grammage_gsm", type: "number", min: 1, max: 5000, step: "0.1" },
      { name: "points", type: "number", min: 1, max: 1000, step: "0.1" },
      { name: "min_weight_g", type: "number", integer: true, min: 0, max: 10000000 },
      { name: "max_weight_g", type: "number", integer: true, min: 1, max: 10000000 },
      ...tail,
    ],
    listColumns: ["grammage_gsm", "min_weight_g", "max_weight_g"],
  },
  print_options: {
    key: "print_options",
    slug: "impresion",
    table: "print_options",
    hasGallery: false,
    fields: [
      ...head,
      { name: "ink_count", type: "number", integer: true, min: 0, max: 20 },
      { name: "requires_pantone", type: "boolean" },
      { name: "is_no_print", type: "boolean" },
      ...tail,
    ],
    listColumns: ["ink_count"],
  },
  finishes: {
    key: "finishes",
    slug: "acabados",
    table: "finishes",
    hasGallery: false,
    fields: [...head, ...tail],
    listColumns: [],
  },
  eco_attributes: {
    key: "eco_attributes",
    slug: "atributos-ambientales",
    table: "eco_attributes",
    hasGallery: false,
    fields: [
      ...head,
      { name: "show_badge", type: "boolean" },
      { name: "certificate_url", type: "text", maxLength: 500 },
      ...tail,
    ],
    listColumns: ["show_badge"],
  },
  food_attributes: {
    key: "food_attributes",
    slug: "aptitud-alimentaria",
    table: "food_attributes",
    hasGallery: false,
    fields: [
      ...head,
      { name: "suggested_for_conditions", type: "enum-multi", options: CONDITIONS, enumType: "product_condition" },
      ...tail,
    ],
    listColumns: [],
  },
  gallery_samples: {
    key: "gallery_samples",
    slug: "galeria",
    table: "gallery_samples",
    hasGallery: true,
    fields: [
      { name: "code", type: "text", required: true, pattern: "^M-\\d{3,5}$", maxLength: 10 },
      { name: "name", type: "text", required: true, maxLength: 160 },
      { name: "description", type: "textarea", maxLength: 2000 },
      { name: "segments", type: "enum-multi", options: SEGMENTS, enumType: "segment" },
      { name: "product_type_id", type: "ref", ref: "product_types" },
      { name: "paper_id", type: "ref", ref: "papers" },
      { name: "finish_ids", type: "ref-multi", ref: "finishes" },
      { name: "tags", type: "lines" },
      ...tail,
    ],
    listColumns: ["product_type_id", "segments"],
  },
};

export const ENTITY_ORDER: readonly EntityKey[] = [
  "categories",
  "product_types",
  "standard_sizes",
  "papers",
  "calibers",
  "print_options",
  "finishes",
  "eco_attributes",
  "food_attributes",
  "gallery_samples",
];

export function entityBySlug(slug: string): EntityDef | null {
  return Object.values(ENTITIES).find((e) => e.slug === slug) ?? null;
}

export type FieldValue = string | number | boolean | null | string[];

export type ParseResult =
  | { ok: true; values: Record<string, FieldValue> }
  | { ok: false; errors: Record<string, "required" | "invalid" | "tooLong" | "outOfRange"> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Convierte y valida los valores de un formulario según la definición de campos. */
export function parseEntityForm(def: EntityDef, form: FormData): ParseResult {
  const values: Record<string, FieldValue> = {};
  const errors: Record<string, "required" | "invalid" | "tooLong" | "outOfRange"> = {};
  for (const field of def.fields) {
    const raw = form.get(field.name);
    const text = typeof raw === "string" ? raw.trim() : "";
    switch (field.type) {
      case "text":
      case "textarea": {
        if (!text) {
          if (field.required) errors[field.name] = "required";
          values[field.name] = null;
          break;
        }
        if (field.maxLength && text.length > field.maxLength) errors[field.name] = "tooLong";
        else if (field.type === "text" && field.pattern && !new RegExp(field.pattern).test(text)) errors[field.name] = "invalid";
        values[field.name] = text;
        break;
      }
      case "number": {
        if (!text) {
          if (field.required) errors[field.name] = "required";
          values[field.name] = field.name === "sort_order" ? 0 : null;
          break;
        }
        const n = Number(text.replace(",", "."));
        if (!Number.isFinite(n) || (field.integer && !Number.isInteger(n))) errors[field.name] = "invalid";
        else if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) errors[field.name] = "outOfRange";
        values[field.name] = n;
        break;
      }
      case "boolean":
        values[field.name] = raw === "on" || raw === "true";
        break;
      case "enum":
        if (!text) {
          if (field.required) errors[field.name] = "required";
          values[field.name] = null;
        } else if (!field.options.includes(text)) errors[field.name] = "invalid";
        else values[field.name] = text;
        break;
      case "enum-multi":
        values[field.name] = form
          .getAll(field.name)
          .map(String)
          .filter((v) => field.options.includes(v));
        break;
      case "ref":
        if (!text) {
          if (field.required) errors[field.name] = "required";
          values[field.name] = null;
        } else if (!UUID.test(text)) errors[field.name] = "invalid";
        else values[field.name] = text;
        break;
      case "ref-multi":
        values[field.name] = form
          .getAll(field.name)
          .map(String)
          .filter((v) => UUID.test(v));
        break;
      case "lines":
        values[field.name] = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 50);
        break;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, values };
}
