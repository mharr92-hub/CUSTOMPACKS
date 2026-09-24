import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signToken } from "@/lib/tokens";

/**
 * Almacenamiento de archivos. Con credenciales de Supabase usa Storage
 * (buckets creados por las migraciones); sin ellas guarda en disco local
 * (STORAGE_LOCAL_DIR) y sirve los archivos por /api/storage con tokens
 * firmados de corta duración. Mismo contrato en ambos modos.
 */
export const BUCKETS = {
  catalog: { public: true },
  artwork: { public: false },
  evidence: { public: false },
  documents: { public: false },
} as const;

export type BucketName = keyof typeof BUCKETS;

export function isBucketName(value: string): value is BucketName {
  return Object.hasOwn(BUCKETS, value);
}

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export function assertSafePath(objectPath: string): void {
  if (!SAFE_PATH.test(objectPath) || objectPath.includes("..")) {
    throw new Error(`Ruta de archivo no válida: ${objectPath}`);
  }
}

/** Nombre de archivo seguro a partir del original (sin tildes ni espacios). */
export function safeFileName(original: string): string {
  const base = original
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return base || "archivo";
}

// ---------------------------------------------------------------------------
// Modo local
// ---------------------------------------------------------------------------
function localRoot(): string {
  return path.resolve(process.cwd(), getServerEnv().storageLocalDir);
}

export function localObjectPath(bucket: BucketName, objectPath: string): string {
  assertSafePath(objectPath);
  return path.join(localRoot(), bucket, ...objectPath.split("/"));
}

function localMetaPath(bucket: BucketName, objectPath: string): string {
  return path.join(localRoot(), ".meta", bucket, ...objectPath.split("/")) + ".json";
}

export async function writeLocalMeta(bucket: BucketName, objectPath: string, contentType: string): Promise<void> {
  const metaPath = localMetaPath(bucket, objectPath);
  await fs.mkdir(path.dirname(metaPath), { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify({ contentType }), "utf8");
}

export async function readLocalMeta(bucket: BucketName, objectPath: string): Promise<{ contentType: string }> {
  try {
    return JSON.parse(await fs.readFile(localMetaPath(bucket, objectPath), "utf8")) as { contentType: string };
  } catch {
    return { contentType: "application/octet-stream" };
  }
}

function supabaseOrNull() {
  return getServerEnv().supabase ? createSupabaseAdminClient() : null;
}

// ---------------------------------------------------------------------------
// API común
// ---------------------------------------------------------------------------
export async function putObject(bucket: BucketName, objectPath: string, data: Buffer, contentType: string): Promise<void> {
  assertSafePath(objectPath);
  const supabase = supabaseOrNull();
  if (supabase) {
    const { error } = await supabase.storage.from(bucket).upload(objectPath, data, { contentType, upsert: true });
    if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
    return;
  }
  const target = localObjectPath(bucket, objectPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  await writeLocalMeta(bucket, objectPath, contentType);
}

export async function getObject(bucket: BucketName, objectPath: string): Promise<{ data: Buffer; contentType: string } | null> {
  assertSafePath(objectPath);
  const supabase = supabaseOrNull();
  if (supabase) {
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  }
  try {
    const data = await fs.readFile(localObjectPath(bucket, objectPath));
    return { data, ...(await readLocalMeta(bucket, objectPath)) };
  } catch {
    return null;
  }
}

/** Primeros bytes del objeto (para validar el tipo real tras una subida directa). */
export async function readObjectHead(bucket: BucketName, objectPath: string, length = 1024): Promise<{ head: Uint8Array; size: number } | null> {
  assertSafePath(objectPath);
  const supabase = supabaseOrNull();
  if (supabase) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 60);
    if (!data?.signedUrl) return null;
    const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${length - 1}` } });
    if (!response.ok) return null;
    const head = new Uint8Array(await response.arrayBuffer()).slice(0, length);
    const range = response.headers.get("content-range");
    const size = range ? Number(range.split("/")[1]) : Number(response.headers.get("content-length") ?? head.length);
    return { head, size };
  }
  try {
    const file = localObjectPath(bucket, objectPath);
    const stat = await fs.stat(file);
    const handle = await fs.open(file, "r");
    try {
      const buffer = Buffer.alloc(Math.min(length, stat.size));
      await handle.read(buffer, 0, buffer.length, 0);
      return { head: new Uint8Array(buffer), size: stat.size };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function removeObject(bucket: BucketName, objectPath: string): Promise<void> {
  assertSafePath(objectPath);
  const supabase = supabaseOrNull();
  if (supabase) {
    await supabase.storage.from(bucket).remove([objectPath]);
    return;
  }
  await fs.rm(localObjectPath(bucket, objectPath), { force: true });
  await fs.rm(localMetaPath(bucket, objectPath), { force: true });
}

/** URL pública (solo buckets públicos, como `catalog`). */
export function publicUrl(bucket: BucketName, objectPath: string): string {
  assertSafePath(objectPath);
  if (!BUCKETS[bucket].public) throw new Error(`El bucket ${bucket} es privado`);
  const env = getServerEnv();
  if (env.supabase) return `${env.supabase.url}/storage/v1/object/public/${bucket}/${objectPath}`;
  return `/api/storage/public/${bucket}/${objectPath}`;
}

/**
 * URL firmada de lectura con caducidad (buckets privados). En modo local es
 * relativa al sitio; para correos usar absoluteUrl() de lib/urls.
 */
export async function signedUrl(
  bucket: BucketName,
  objectPath: string,
  opts: { expiresIn?: number; downloadName?: string } = {},
): Promise<string> {
  assertSafePath(objectPath);
  const expiresIn = opts.expiresIn ?? 600;
  const supabase = supabaseOrNull();
  if (supabase) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, expiresIn, opts.downloadName ? { download: opts.downloadName } : undefined);
    if (error || !data) throw new Error(`No se pudo firmar la URL: ${error?.message ?? "sin datos"}`);
    return data.signedUrl;
  }
  const token = await signToken({ b: bucket, p: objectPath, dn: opts.downloadName }, "storage:read", expiresIn);
  return `/api/storage/object?t=${encodeURIComponent(token)}`;
}

/**
 * URL firmada para subir directo desde el navegador con PUT (con barra de
 * progreso y sin pasar el archivo por las funciones del servidor).
 */
export async function signedUploadUrl(
  bucket: BucketName,
  objectPath: string,
  opts: { maxBytes: number; expiresIn?: number },
): Promise<{ url: string; method: "PUT"; headers: Record<string, string> }> {
  assertSafePath(objectPath);
  const supabase = supabaseOrNull();
  if (supabase) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(objectPath);
    if (error || !data) throw new Error(`No se pudo preparar la subida: ${error?.message ?? "sin datos"}`);
    return { url: data.signedUrl, method: "PUT", headers: { "x-upsert": "false" } };
  }
  const token = await signToken({ b: bucket, p: objectPath, max: opts.maxBytes }, "storage:write", opts.expiresIn ?? 3600);
  return { url: `/api/storage/upload?t=${encodeURIComponent(token)}`, method: "PUT", headers: {} };
}
