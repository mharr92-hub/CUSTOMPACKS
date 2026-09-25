import fs from "node:fs";
import { Readable } from "node:stream";
import { getServerEnv } from "@/lib/env";
import { isBucketName, localObjectPath, readLocalMeta } from "@/lib/storage";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";

type ReadClaims = { b: string; p: string; dn?: string };

/** Lectura de archivos privados en modo local, solo con token firmado vigente. */
export async function GET(request: Request) {
  if (getServerEnv().supabase) return new Response(null, { status: 404 });
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const claims = await verifyToken<ReadClaims>(token, "storage:read");
  if (!claims || !isBucketName(claims.b)) return new Response("Enlace vencido o no válido", { status: 403 });
  let file: string;
  try {
    file = localObjectPath(claims.b, claims.p);
  } catch {
    return new Response(null, { status: 400 });
  }
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response(null, { status: 404 });
  const { contentType } = await readLocalMeta(claims.b, claims.p);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(stat.size),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  // Archivos subidos por terceros (SVG, EPS…): nunca ejecutan scripts en el origen del sitio.
  // El PDF queda fuera porque el visor del navegador no abre en un documento aislado.
  if (contentType !== "application/pdf") headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";
  if (claims.dn) headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(claims.dn)}`;
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers });
}
