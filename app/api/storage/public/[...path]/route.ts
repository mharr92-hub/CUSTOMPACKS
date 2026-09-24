import fs from "node:fs";
import { Readable } from "node:stream";
import { getServerEnv } from "@/lib/env";
import { BUCKETS, isBucketName, localObjectPath, readLocalMeta } from "@/lib/storage";

export const runtime = "nodejs";

/** Archivos de buckets públicos en modo local (con Supabase se sirven desde su CDN). */
export async function GET(_request: Request, ctx: RouteContext<"/api/storage/public/[...path]">) {
  if (getServerEnv().supabase) return new Response(null, { status: 404 });
  const [bucket, ...rest] = (await ctx.params).path;
  if (!bucket || !isBucketName(bucket) || !BUCKETS[bucket].public || rest.length === 0) {
    return new Response(null, { status: 404 });
  }
  const objectPath = rest.join("/");
  let file: string;
  try {
    file = localObjectPath(bucket, objectPath);
  } catch {
    return new Response(null, { status: 400 });
  }
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response(null, { status: 404 });
  const { contentType } = await readLocalMeta(bucket, objectPath);
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
