"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { confirmDraftUploadAction, draftFileUrlAction, prepareDraftUploadAction, removeDraftFileAction } from "@/app/cotizar/upload-actions";
import { FilePreview } from "@/components/upload/file-preview";
import { FileUploader } from "@/components/upload/file-uploader";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import type { ItemDraft, UploadedFile } from "@/lib/quote/types";
import { useWizard } from "./context";

const ACCEPT = {
  artwork: { accept: ".pdf,.ai,.eps,.svg,application/pdf,application/postscript,image/svg+xml", extensions: ["pdf", "ai", "eps", "svg"] },
  reference: { accept: ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf", extensions: ["png", "jpg", "jpeg", "webp", "pdf"] },
} as const;

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Archivos de una pieza en el paso 7 (arte o fotos de referencia). Suben
 * directo al almacenamiento privado colgando del borrador; al enviar la
 * solicitud pasan a ella (D-046).
 */
export function DraftFiles({ index, item, purpose }: { index: number; item: ItemDraft; purpose: "artwork" | "reference" }) {
  const t = useTranslations("artwork");
  const tu = useTranslations("upload");
  const { updateItem, ensureSaved, draftToken, settings } = useWizard();
  const files = purpose === "artwork" ? item.artworkFiles : item.referencePhotos;
  const field = purpose === "artwork" ? "artworkFiles" : "referencePhotos";
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const tokenRef = useRef<string | null>(draftToken);
  /** Rutas cuya vista previa ya se pidió (no se repite la llamada en cada render). */
  const requested = useRef(new Set<string>());

  // Vistas previas de archivos subidos en otra visita (URL firmada nueva).
  useEffect(() => {
    const missing = files.filter((f) => !previews[f.path] && !requested.current.has(f.path));
    if (!draftToken || missing.length === 0) return;
    for (const f of missing) requested.current.add(f.path);
    let cancelled = false;
    void Promise.all(missing.map(async (f) => [f.path, await draftFileUrlAction(draftToken, item.key, f.path).catch(() => null)] as const)).then((pairs) => {
      if (cancelled) return;
      const found = pairs.filter((p): p is readonly [string, string] => typeof p[1] === "string");
      if (found.length) setPreviews((prev) => ({ ...prev, ...Object.fromEntries(found) }));
    });
    return () => {
      cancelled = true;
    };
  }, [files, previews, draftToken, item.key]);

  const setFiles = (fn: (list: UploadedFile[]) => UploadedFile[]) => updateItem((it) => ({ ...it, [field]: fn(it[field]) }), index);

  return (
    <div className="space-y-3">
      <FileUploader
        label={purpose === "artwork" ? t("uploadArtwork") : t("uploadReferences")}
        hint={purpose === "artwork" ? t("artworkHint") : t("referenceHint")}
        accept={ACCEPT[purpose].accept}
        extensions={ACCEPT[purpose].extensions}
        maxMb={settings.upload.maxMb}
        maxFiles={settings.upload.maxFiles}
        currentCount={files.length}
        testId={`upload-${purpose}-${index}`}
        requestSlot={async (file) => {
          // El archivo cuelga del borrador: primero se guarda (así el servidor conoce la pieza).
          const token = await ensureSaved();
          tokenRef.current = token;
          if (!token) return { ok: false, error: "network" };
          return prepareDraftUploadAction(token, item.key, purpose, { name: file.name, size: file.size });
        }}
        confirm={async (input) => {
          const token = tokenRef.current;
          if (!token) return { ok: false, error: "expired" };
          return confirmDraftUploadAction(token, item.key, purpose, input);
        }}
        onUploaded={(file, previewUrl) => {
          setFiles((list) => (list.some((x) => x.path === file.path) ? list : [...list, file]));
          if (previewUrl) setPreviews((prev) => ({ ...prev, [file.path]: previewUrl }));
          track("wizard_file_uploaded", { purpose, kind: file.kind });
        }}
      />
      {files.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={t("uploaded")}>
          {files.map((f) => (
            <li key={f.path} className="rounded-lg border border-border p-2">
              <FilePreview url={previews[f.path] ?? null} kind={f.kind} name={f.name} size={f.size} />
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tu("remove", { name: f.name })}
                  onClick={() => {
                    setFiles((list) => list.filter((x) => x.path !== f.path));
                    if (draftToken) void removeDraftFileAction(draftToken, item.key, f.path).catch(() => false);
                  }}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
