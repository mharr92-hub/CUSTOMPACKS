import "server-only";
import { z } from "zod";
import { CONDITIONS } from "@/lib/catalog/entities";
import { ARTWORK_CHOICES, FREQUENCIES, LEAD_SOURCES, PRINT_COVERAGES, PRINT_FACES, PRODUCT_USES, WIZARD_VERSION, type WizardState } from "./types";

/**
 * Esquema del estado del wizard para lo que llega del navegador (borradores y
 * envío). Limita tamaños y tipos; la validación de negocio vive en validate.ts.
 */
const text = (max: number) => z.string().max(max).default("");
const id = z.uuid().nullable().default(null);
const ids = z.array(z.uuid()).max(30).default([]);
const file = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  size: z.number().int().nonnegative(),
  path: z.string().max(400),
  kind: z.string().max(20),
});

const item = z.object({
  key: z.string().max(40),
  categoryId: id,
  productTypeId: id,
  needsAdvice: z.boolean().default(false),
  sizeMode: z.enum(["standard", "custom", "by_product"]).nullable().default(null),
  standardSizeId: id,
  length: text(12),
  width: text(12),
  height: text(12),
  materialAdvice: z.boolean().default(false),
  paperId: id,
  caliberId: id,
  ecoIds: ids,
  foodIds: ids,
  printOptionId: id,
  pantone: text(200),
  faces: z.enum(PRINT_FACES as [string, ...string[]]).nullable().default(null),
  coverage: z.enum(PRINT_COVERAGES as [string, ...string[]]).nullable().default(null),
  finishIds: ids,
  quantities: z.tuple([text(20), text(20), text(20)]).default(["", "", ""]),
  frequency: z.enum(FREQUENCIES as [string, ...string[]]).nullable().default(null),
  artwork: z.enum(ARTWORK_CHOICES as [string, ...string[]]).nullable().default(null),
  artworkFiles: z.array(file).max(20).default([]),
  referenceLinks: z.array(z.string().max(500)).max(10).default([]),
  referenceSampleIds: ids,
  referencePhotos: z.array(file).max(20).default([]),
});

export const wizardStateSchema = z.object({
  version: z.literal(WIZARD_VERSION),
  step: z.number().int().min(0).max(9),
  current: z.number().int().min(0).max(19),
  segment: z.enum(["commercial", "food", "unsure"]).nullable(),
  product: z.object({
    name: text(200),
    contents: text(500),
    weight: text(20),
    weightUnit: z.enum(["g", "kg"]).default("g"),
    length: text(12),
    width: text(12),
    height: text(12),
    volume: text(100),
    conditions: z.array(z.enum(CONDITIONS)).max(5).default([]),
    uses: z.array(z.enum(PRODUCT_USES as [string, ...string[]])).max(5).default([]),
  }),
  items: z.array(item).min(1).max(20),
  desiredDate: text(10),
  contact: z.object({
    company: text(200),
    ruc: text(40),
    name: text(160),
    position: text(120),
    whatsapp: text(40),
    email: text(200),
    city: text(120),
    address: text(400),
    source: z.enum([...LEAD_SOURCES, ""] as [string, ...string[]]).default(""),
    comments: text(2000),
    consent: z.boolean().default(false),
  }),
  utm: z.record(z.string().max(40), z.string().max(200)).default({}),
  referrer: text(500),
  startedAt: z.string().max(40),
});

/** Devuelve el estado saneado o null si no tiene la forma esperada. */
export function parseWizardState(input: unknown): WizardState | null {
  const result = wizardStateSchema.safeParse(input);
  if (!result.success) return null;
  const state = result.data as unknown as WizardState;
  if (state.current >= state.items.length) state.current = state.items.length - 1;
  return state;
}
