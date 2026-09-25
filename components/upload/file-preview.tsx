"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileTypeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const IMAGE_KINDS = new Set(["png", "jpeg", "webp", "gif"]);
/** Un .ai moderno es un PDF por dentro: pdf.js puede mostrar su primera página. */
const PDF_KINDS = new Set(["pdf", "ai"]);
/** Por encima de este tamaño no se descarga el PDF para la vista previa (datos móviles). */
const PDF_PREVIEW_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Vista previa: imágenes tal cual, primera página de PDF/AI con pdf.js
 * (cargado solo cuando hace falta) y un ícono con el nombre para EPS/SVG.
 */
export function FilePreview({ url, kind, name, size, className }: { url: string | null; kind: string; name: string; size?: number; className?: string }) {
  const t = useTranslations("upload");
  if (url && IMAGE_KINDS.has(kind)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- archivo privado con URL firmada de corta duración
      <img src={url} alt={t("previewAlt", { name })} className={cn("h-40 w-full rounded-md border border-border bg-muted object-contain", className)} />
    );
  }
  if (url && PDF_KINDS.has(kind) && (size ?? 0) <= PDF_PREVIEW_MAX_BYTES) return <PdfFirstPage url={url} name={name} className={className} />;
  return (
    <div className={cn("flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted px-3 text-center", className)}>
      <FileTypeIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase">{kind}</span>
      <span className="line-clamp-2 text-xs break-all text-muted-foreground">{name}</span>
    </div>
  );
}

function PdfFirstPage({ url, name, className }: { url: string; name: string; className?: string }) {
  const t = useTranslations("upload");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const task = pdfjs.getDocument({ url });
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 320 / base.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) setState("ready");
        await task.destroy();
      } catch {
        if (!cancelled) setState("error");
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className={cn("relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted", className)}>
      <canvas ref={canvasRef} role="img" aria-label={t("previewAlt", { name })} className={cn("max-h-full max-w-full", state === "ready" ? "" : "hidden")} />
      {state === "loading" ? <span className="text-xs text-muted-foreground">{t("previewLoading")}</span> : null}
      {state === "error" ? <span className="px-3 text-center text-xs text-muted-foreground">{t("previewError", { name })}</span> : null}
    </div>
  );
}
