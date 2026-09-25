"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { assertStaff, type CurrentUser } from "@/lib/auth";
import {
  addEntityGalleryPhoto,
  CatalogError,
  getEntityRow,
  insertEntity,
  moveEntity,
  removeEntityGalleryPhoto,
  setCompatRule,
  setEntityActive,
  setEntityPhoto,
  updateEntity,
  updateSetting,
  type CompatState,
} from "@/lib/catalog/admin";
import { ENTITIES, parseEntityForm, type EntityDef } from "@/lib/catalog/entities";
import { CATALOG_TAG } from "@/lib/catalog/public";
import { detectFileKind, extensionForKind, IMAGE_KINDS, mimeForKind } from "@/lib/files/magic";
import { log } from "@/lib/log";
import { publicUrl, putObject } from "@/lib/storage";
import { fileNonce } from "@/lib/tokens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type ActionError =
  | "required"
  | "invalid"
  | "tooLong"
  | "outOfRange"
  | "duplicate"
  | "in_use"
  | "not_found"
  | "forbidden"
  | "generic"
  | "photoType"
  | "photoSize"
  | "photoMissing";

export type FormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; error?: ActionError; fieldErrors?: Record<string, ActionError> };

function entity(key: string): EntityDef {
  const def = (ENTITIES as Record<string, EntityDef | undefined>)[key];
  if (!def) throw new CatalogError("invalid");
  return def;
}

async function adminOnly(): Promise<CurrentUser | null> {
  try {
    return await assertStaff(["admin"]);
  } catch {
    return null;
  }
}

function toError(error: unknown): ActionError {
  if (error instanceof CatalogError) return error.code;
  log.error("error en acción del catálogo", { error });
  return "generic";
}

function invalidateCatalog(def?: EntityDef) {
  updateTag(CATALOG_TAG);
  revalidatePath(def ? `/admin/catalogo/${def.slug}` : "/admin/catalogo", "layout");
  revalidatePath("/", "layout");
}

export async function saveEntityAction(entityKey: string, id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await adminOnly();
  if (!user) return { status: "error", error: "forbidden" };
  if (id !== null && !UUID.test(id)) return { status: "error", error: "not_found" };
  let def: EntityDef;
  try {
    def = entity(entityKey);
  } catch {
    return { status: "error", error: "invalid" };
  }
  const parsed = parseEntityForm(def, form);
  if (!parsed.ok) return { status: "error", error: "invalid", fieldErrors: parsed.errors };
  let newId: string | null = null;
  try {
    if (id) await updateEntity(user, def, id, parsed.values);
    else newId = await insertEntity(user, def, parsed.values);
  } catch (error) {
    return { status: "error", error: toError(error) };
  }
  invalidateCatalog(def);
  if (newId) redirect(`/admin/catalogo/${def.slug}/${newId}`);
  return { status: "saved" };
}

export async function setActiveAction(entityKey: string, id: string, active: boolean): Promise<void> {
  const user = await adminOnly();
  if (!user || !UUID.test(id)) return;
  const def = entity(entityKey);
  await setEntityActive(user, def, id, active);
  invalidateCatalog(def);
}

export async function moveAction(entityKey: string, id: string, direction: -1 | 1): Promise<void> {
  const user = await adminOnly();
  if (!user || !UUID.test(id) || (direction !== -1 && direction !== 1)) return;
  const def = entity(entityKey);
  await moveEntity(user, def, id, direction);
  invalidateCatalog(def);
}

export async function uploadPhotoAction(
  entityKey: string,
  id: string,
  mode: "main" | "extra",
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await adminOnly();
  if (!user) return { status: "error", error: "forbidden" };
  if (!UUID.test(id)) return { status: "error", error: "not_found" };
  const def = entity(entityKey);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", error: "photoMissing" };
  if (file.size > MAX_PHOTO_BYTES) return { status: "error", error: "photoSize" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detectFileKind(bytes.subarray(0, 1024), file.name);
  if (!IMAGE_KINDS.includes(kind)) return { status: "error", error: "photoType" };
  try {
    const row = await getEntityRow(user, def, id);
    if (!row) return { status: "error", error: "not_found" };
    const objectPath = `${def.table}/${id}/${fileNonce()}.${extensionForKind(kind)}`;
    await putObject("catalog", objectPath, bytes, mimeForKind(kind));
    const url = publicUrl("catalog", objectPath);
    if (mode === "extra" && def.hasGallery) await addEntityGalleryPhoto(user, def, id, url);
    else await setEntityPhoto(user, def, id, url);
  } catch (error) {
    return { status: "error", error: toError(error) };
  }
  invalidateCatalog(def);
  return { status: "saved" };
}

export async function removePhotoAction(entityKey: string, id: string, mode: "main" | "extra", url: string): Promise<void> {
  const user = await adminOnly();
  if (!user || !UUID.test(id)) return;
  const def = entity(entityKey);
  if (mode === "extra") await removeEntityGalleryPhoto(user, def, id, url);
  else await setEntityPhoto(user, def, id, null);
  invalidateCatalog(def);
}

export async function setCompatRuleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await adminOnly();
  if (!user) return { status: "error", error: "forbidden" };
  const productTypeId = String(form.get("productTypeId") ?? "");
  const paperId = String(form.get("paperId") ?? "") || null;
  const caliberId = String(form.get("caliberId") ?? "") || null;
  const state = String(form.get("state") ?? "none") as CompatState;
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300) || null;
  if (!UUID.test(productTypeId) || (paperId && !UUID.test(paperId)) || (caliberId && !UUID.test(caliberId))) {
    return { status: "error", error: "invalid" };
  }
  if (!["none", "allowed", "blocked"].includes(state) || (!paperId && !caliberId)) return { status: "error", error: "invalid" };
  try {
    await setCompatRule(user, { productTypeId, paperId, caliberId, state, reason });
  } catch (error) {
    return { status: "error", error: toError(error) };
  }
  invalidateCatalog();
  return { status: "saved" };
}

export async function saveSettingAction(key: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await adminOnly();
  if (!user) return { status: "error", error: "forbidden" };
  try {
    await updateSetting(user, key, String(form.get("value") ?? ""));
  } catch (error) {
    return { status: "error", error: toError(error) };
  }
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/configuracion");
  return { status: "saved" };
}
