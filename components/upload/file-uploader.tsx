"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, FileIcon, RotateCcwIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConfirmResult, SlotResult, UploadErrorKey, UploadedFile } from "@/lib/artwork/upload-types";
import { cn } from "@/lib/utils";

/*
 * Subida directa al almacenamiento con URL firmada (PUT): barra de progreso,
 * reintentos automáticos y verificación del tipo real en el servidor al final.
 * Sirve para el wizard (borrador), el seguimiento del cliente y el panel.
 */
export type { ConfirmResult, SlotResult, UploadErrorKey, UploadedFile };

type Row = {
  key: string;
  file: File;
  status: "uploading" | "verifying" | "done" | "error";
  progress: number;
  error?: UploadErrorKey;
};

const RETRIES = 3;

function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("abort"));
    xhr.send(file);
  });
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(mb)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileUploader({
  label,
  hint,
  accept,
  extensions,
  maxMb,
  maxFiles,
  currentCount,
  requestSlot,
  confirm,
  onUploaded,
  testId,
}: {
  label: string;
  hint?: string;
  accept: string;
  /** Extensiones permitidas en minúsculas, sin punto (validación previa en el navegador). */
  extensions: readonly string[];
  maxMb: number;
  maxFiles: number;
  currentCount: number;
  requestSlot: (file: { name: string; size: number; type: string }) => Promise<SlotResult>;
  confirm: (input: { path: string; name: string; size: number }) => Promise<ConfirmResult>;
  onUploaded: (file: UploadedFile, previewUrl?: string) => void;
  testId?: string;
}) {
  const t = useTranslations("upload");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function uploadOne(row: Row) {
    const { file, key } = row;
    patch(key, { status: "uploading", progress: 0, error: undefined });
    const slot = await requestSlot({ name: file.name, size: file.size, type: file.type });
    if (!slot.ok) {
      patch(key, { status: "error", error: slot.error });
      return;
    }
    let status = 0;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        status = await putWithProgress(slot.url, file, slot.headers, (progress) => patch(key, { progress }));
        if (status >= 200 && status < 300) break;
        if (status === 413) break;
      } catch {
        status = 0;
      }
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    if (status === 413) return patch(key, { status: "error", error: "tooLarge" });
    if (status === 403) return patch(key, { status: "error", error: "expired" });
    if (status < 200 || status >= 300) return patch(key, { status: "error", error: "network" });
    patch(key, { status: "verifying", progress: 100 });
    const result = await confirm({ path: slot.path, name: file.name, size: file.size });
    if (!result.ok) return patch(key, { status: "error", error: result.error });
    // Ya subido: lo muestra la lista del componente padre (no se repite aquí).
    setRows((rs) => rs.filter((r) => r.key !== key));
    onUploaded(result.file, result.previewUrl);
  }

  function onFiles(list: FileList | null) {
    setNotice(null);
    if (!list || list.length === 0) return;
    const inFlight = rows.filter((r) => r.status === "uploading" || r.status === "verifying").length;
    const room = Math.max(0, maxFiles - currentCount - inFlight);
    const files = Array.from(list);
    if (files.length > room) setNotice(t("errors.tooMany", { max: maxFiles }));
    const next: Row[] = [];
    for (const file of files.slice(0, room)) {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      const key = `${file.name}-${file.size}-${file.lastModified}-${Math.round(performance.now())}`;
      if (!extensions.includes(ext)) next.push({ key, file, status: "error", progress: 0, error: "badType" });
      else if (file.size > maxMb * 1024 * 1024) next.push({ key, file, status: "error", progress: 0, error: "tooLarge" });
      else next.push({ key, file, status: "uploading", progress: 0 });
    }
    setRows((rs) => [...rs, ...next]);
    for (const row of next) if (row.status === "uploading") void uploadOne(row);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3" data-testid={testId}>
      <div>
        <label htmlFor={inputId} className="block text-sm font-semibold">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p> : null}
        <div className="mt-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={accept}
            onChange={(e) => onFiles(e.target.files)}
            className="sr-only"
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={currentCount >= maxFiles}>
            <UploadIcon className="size-4" />
            {t("choose")}
          </Button>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("limits", { max: maxMb, files: maxFiles })}</p>
        </div>
      </div>
      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} className={cn("rounded-md border px-3 py-2", r.status === "error" ? "border-destructive/40 bg-destructive/5" : "border-border")}>
              <div className="flex items-center gap-2 text-sm">
                {r.status === "done" ? <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-signal-green" /> : <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate font-medium">{r.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(r.file.size)}</span>
                {r.status === "error" ? (
                  <>
                    {r.error === "network" || r.error === "expired" || r.error === "generic" ? (
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={t("retry", { name: r.file.name })} onClick={() => void uploadOne(r)}>
                        <RotateCcwIcon className="size-4" />
                      </Button>
                    ) : null}
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("dismiss", { name: r.file.name })} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <XIcon className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
              {r.status === "uploading" || r.status === "verifying" ? (
                <div className="mt-2">
                  <div
                    role="progressbar"
                    aria-label={t("progressLabel", { name: r.file.name })}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={r.progress}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full rounded-full bg-forest transition-[width] duration-200" style={{ width: `${r.progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.status === "verifying" ? t("verifying") : t("uploading", { pct: r.progress })}</p>
                </div>
              ) : null}
              {r.status === "error" && r.error ? (
                <p className="mt-1 text-xs font-medium text-destructive">{t(`errors.${r.error}`, { name: r.file.name, max: maxMb })}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
