import "server-only";
import type postgres from "postgres";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import type { EntityDef, EntityKey, FieldDef, FieldValue } from "./entities";
import { ENTITIES } from "./entities";

/**
 * Operaciones del panel sobre el catálogo. Todas corren con el usuario del
 * panel (RLS: solo admin escribe). Tablas y columnas salen de ENTITIES, nunca
 * de la entrada del usuario.
 */
export type EntityRow = Record<string, unknown> & {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_provisional: boolean;
  sort_order: number;
  photo_url: string | null;
};

export type RefOption = { id: string; code: string; name: string; is_active: boolean };

export class CatalogError extends Error {
  constructor(public readonly code: "duplicate" | "not_found" | "in_use" | "invalid") {
    super(code);
  }
}

type Fragment = postgres.PendingQuery<postgres.Row[]>;

function joinFragments(tx: Tx, fragments: Fragment[]): Fragment {
  return fragments.reduce<Fragment | null>((acc, f) => (acc ? tx`${acc}, ${f}` : f), null) ?? tx``;
}

function valueFragment(tx: Tx, field: FieldDef, value: FieldValue): Fragment {
  if (value === null) return tx`null`;
  switch (field.type) {
    case "enum":
      return tx`${value as string}::${tx.unsafe(`public.${field.enumType}`)}`;
    case "enum-multi":
      return tx`${value as string[]}::${tx.unsafe(`public.${field.enumType}[]`)}`;
    case "ref":
      return tx`${value as string}::uuid`;
    case "ref-multi":
      return tx`${value as string[]}::uuid[]`;
    case "lines":
      return tx`${value as string[]}::text[]`;
    case "number":
      return tx`${value as number}::numeric`;
    case "boolean":
      return tx`${value as boolean}::boolean`;
    default:
      return tx`${value as string}`;
  }
}

function mapDbError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "23505") throw new CatalogError("duplicate");
  if (code === "23503") throw new CatalogError("in_use");
  if (code === "23514" || code === "22P02") throw new CatalogError("invalid");
  throw error;
}

export async function listEntityRows(user: CurrentUser, def: EntityDef): Promise<EntityRow[]> {
  return withActor(actorFor(user), (tx) => tx<EntityRow[]>`
    select * from ${tx(def.table)} order by sort_order, name`);
}

export async function getEntityRow(user: CurrentUser, def: EntityDef, id: string): Promise<EntityRow | null> {
  const rows = await withActor(actorFor(user), (tx) => tx<EntityRow[]>`select * from ${tx(def.table)} where id = ${id}`);
  return rows[0] ?? null;
}

export async function listRefOptions(user: CurrentUser, key: EntityKey): Promise<RefOption[]> {
  const def = ENTITIES[key];
  return withActor(actorFor(user), (tx) => tx<RefOption[]>`
    select id, code, name, is_active from ${tx(def.table)} order by sort_order, name`);
}

export async function insertEntity(user: CurrentUser, def: EntityDef, values: Record<string, FieldValue>): Promise<string> {
  try {
    return await withActor(actorFor(user), async (tx) => {
      const fields = def.fields.filter((f) => f.name in values);
      const columns = fields.map((f) => f.name);
      const valueList = joinFragments(tx, fields.map((f) => valueFragment(tx, f, values[f.name] ?? null)));
      const [row] = await tx<{ id: string }[]>`
        insert into ${tx(def.table)} (${tx(columns)}) values (${valueList}) returning id`;
      if (!row) throw new CatalogError("invalid");
      return row.id;
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapDbError(error);
  }
}

export async function updateEntity(user: CurrentUser, def: EntityDef, id: string, values: Record<string, FieldValue>): Promise<void> {
  try {
    await withActor(actorFor(user), async (tx) => {
      const fields = def.fields.filter((f) => f.name in values);
      const assignments = joinFragments(tx, fields.map((f) => tx`${tx(f.name)} = ${valueFragment(tx, f, values[f.name] ?? null)}`));
      const rows = await tx`update ${tx(def.table)} set ${assignments} where id = ${id} returning id`;
      if (rows.length === 0) throw new CatalogError("not_found");
    });
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    mapDbError(error);
  }
}

export async function setEntityActive(user: CurrentUser, def: EntityDef, id: string, active: boolean): Promise<void> {
  await withActor(actorFor(user), (tx) => tx`update ${tx(def.table)} set is_active = ${active} where id = ${id}`);
}

/** Mueve una fila una posición arriba o abajo y renumera el orden (10, 20, 30…). */
export async function moveEntity(user: CurrentUser, def: EntityDef, id: string, direction: -1 | 1): Promise<void> {
  await withActor(actorFor(user), async (tx) => {
    const rows = await tx<{ id: string }[]>`select id from ${tx(def.table)} order by sort_order, name for update`;
    const ids = rows.map((r) => r.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    for (const [i, rowId] of ids.entries()) {
      await tx`update ${tx(def.table)} set sort_order = ${(i + 1) * 10} where id = ${rowId} and sort_order is distinct from ${(i + 1) * 10}`;
    }
  });
}

export async function setEntityPhoto(user: CurrentUser, def: EntityDef, id: string, url: string | null): Promise<void> {
  await withActor(actorFor(user), (tx) => tx`update ${tx(def.table)} set photo_url = ${url} where id = ${id}`);
}

export async function addEntityGalleryPhoto(user: CurrentUser, def: EntityDef, id: string, url: string): Promise<void> {
  if (!def.hasGallery) throw new CatalogError("invalid");
  await withActor(actorFor(user), (tx) => tx`
    update ${tx(def.table)} set photos = array_append(photos, ${url}) where id = ${id} and cardinality(photos) < 12`);
}

export async function removeEntityGalleryPhoto(user: CurrentUser, def: EntityDef, id: string, url: string): Promise<void> {
  if (!def.hasGallery) throw new CatalogError("invalid");
  await withActor(actorFor(user), (tx) => tx`update ${tx(def.table)} set photos = array_remove(photos, ${url}) where id = ${id}`);
}

// ---------------------------------------------------------------------------
// Compatibilidades
// ---------------------------------------------------------------------------
export type CompatRuleRow = {
  id: string;
  product_type_id: string;
  paper_id: string | null;
  caliber_id: string | null;
  allowed: boolean;
  reason: string | null;
  is_provisional: boolean;
};

export async function listCompatRules(user: CurrentUser, productTypeId: string): Promise<CompatRuleRow[]> {
  return withActor(actorFor(user), (tx) => tx<CompatRuleRow[]>`
    select id, product_type_id, paper_id, caliber_id, allowed, reason, is_provisional
      from public.compatibilities where product_type_id = ${productTypeId} and is_active`);
}

export type CompatState = "none" | "allowed" | "blocked";

/** Crea, cambia o borra la regla de una celda de la matriz. */
export async function setCompatRule(
  user: CurrentUser,
  input: { productTypeId: string; paperId: string | null; caliberId: string | null; state: CompatState; reason: string | null },
): Promise<void> {
  if (!input.paperId && !input.caliberId) throw new CatalogError("invalid");
  await withActor(actorFor(user), async (tx) => {
    await tx`
      delete from public.compatibilities
       where product_type_id = ${input.productTypeId}
         and paper_id is not distinct from ${input.paperId}::uuid
         and caliber_id is not distinct from ${input.caliberId}::uuid`;
    if (input.state === "none") return;
    await tx`
      insert into public.compatibilities (product_type_id, paper_id, caliber_id, allowed, reason, is_provisional)
      values (${input.productTypeId}, ${input.paperId}::uuid, ${input.caliberId}::uuid, ${input.state === "allowed"}, ${input.reason}, false)`;
  });
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
export type SettingRow = {
  key: string;
  value: unknown;
  value_type: "number" | "string" | "boolean" | "json";
  description: string | null;
  is_public: boolean;
  is_provisional: boolean;
  updated_at: Date;
};

export async function listSettings(user: CurrentUser): Promise<SettingRow[]> {
  return withActor(actorFor(user), (tx) => tx<SettingRow[]>`
    select key, value, value_type, description, is_public, is_provisional, updated_at
      from public.settings where key <> 'admin_email' order by key`);
}

/** Valida el valor según su tipo y lo guarda; al editarlo deja de ser provisional. */
export async function updateSetting(user: CurrentUser, key: string, raw: string): Promise<void> {
  await withActor(actorFor(user), async (tx) => {
    const [setting] = await tx<{ value_type: SettingRow["value_type"] }[]>`select value_type from public.settings where key = ${key}`;
    if (!setting) throw new CatalogError("not_found");
    let value: unknown;
    const text = raw.trim();
    switch (setting.value_type) {
      case "number": {
        const n = Number(text.replace(",", "."));
        if (!text || !Number.isFinite(n)) throw new CatalogError("invalid");
        value = n;
        break;
      }
      case "boolean":
        if (text !== "true" && text !== "false") throw new CatalogError("invalid");
        value = text === "true";
        break;
      case "json":
        try {
          value = JSON.parse(text);
        } catch {
          throw new CatalogError("invalid");
        }
        break;
      default:
        if (!text) throw new CatalogError("invalid");
        value = text;
    }
    await tx`update public.settings set value = ${tx.json(value as postgres.JSONValue)}, is_provisional = false where key = ${key}`;
  });
}

// ---------------------------------------------------------------------------
// Resumen para la portada del catálogo
// ---------------------------------------------------------------------------
export type EntityStats = { total: number; provisional: number; inactive: number };

export async function getCatalogStats(user: CurrentUser): Promise<Record<EntityKey, EntityStats>> {
  return withActor(actorFor(user), async (tx) => {
    const entries = await Promise.all(
      (Object.keys(ENTITIES) as EntityKey[]).map(async (key) => {
        const [row] = await tx<{ total: number; provisional: number; inactive: number }[]>`
          select count(*)::int as total,
                 count(*) filter (where is_provisional)::int as provisional,
                 count(*) filter (where not is_active)::int as inactive
            from ${tx(ENTITIES[key].table)}`;
        return [key, row ?? { total: 0, provisional: 0, inactive: 0 }] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<EntityKey, EntityStats>;
  });
}
