import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getServerEnv } from "@/lib/env";
import { isBucketName, localObjectPath, writeLocalMeta } from "@/lib/storage";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

type WriteClaims = { b: string; p: string; max: number };

class TooLarge extends Error {}

/**
 * Subida directa en modo local (equivale a la URL firmada de Supabase):
 * PUT con el archivo como cuerpo. Rechaza si excede el máximo del token.
 */
export async function PUT(request: Request) {
  if (getServerEnv().supabase) return new Response(null, { status: 404 });
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const claims = await verifyToken<WriteClaims>(token, "storage:write");
  if (!claims || !isBucketName(claims.b)) return Response.json({ error: "token" }, { status: 403 });
  if (!request.body) return Response.json({ error: "empty" }, { status: 400 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > claims.max) return Response.json({ error: "too_large" }, { status: 413 });

  const target = localObjectPath(claims.b, claims.p);
  const partial = `${target}.part`;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > claims.max) callback(new TooLarge());
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream), counter, fs.createWriteStream(partial));
    await fs.promises.rename(partial, target);
  } catch (error) {
    await fs.promises.rm(partial, { force: true });
    if (error instanceof TooLarge) return Response.json({ error: "too_large" }, { status: 413 });
    return Response.json({ error: "write_failed" }, { status: 500 });
  }
  await writeLocalMeta(claims.b, claims.p, request.headers.get("content-type") ?? "application/octet-stream");
  return Response.json({ ok: true, size: received, path: claims.p });
}
