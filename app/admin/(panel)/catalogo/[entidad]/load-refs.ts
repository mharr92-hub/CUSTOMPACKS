import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { listRefOptions, type RefOption } from "@/lib/catalog/admin";
import type { EntityDef, EntityKey } from "@/lib/catalog/entities";

/** Opciones de los campos que referencian otras entidades (selects del formulario). */
export async function loadRefOptions(user: CurrentUser, def: EntityDef): Promise<Partial<Record<EntityKey, RefOption[]>>> {
  const keys = [...new Set(def.fields.flatMap((f) => (f.type === "ref" || f.type === "ref-multi" ? [f.ref] : [])))];
  const entries = await Promise.all(keys.map(async (key) => [key, await listRefOptions(user, key)] as const));
  return Object.fromEntries(entries);
}
