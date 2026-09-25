"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, EyeIcon } from "lucide-react";
import {
  confirmProofUploadAction,
  prepareProofUploadAction,
  releaseProofAction,
  reviewArtworkAction,
  staffFileUrlAction,
} from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { FileUploader } from "@/components/upload/file-uploader";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { CHECKLIST_KEYS, STAFF_ARTWORK_TRANSITIONS, type ArtworkStatus, type Checklist, type ChecklistResult } from "@/lib/artwork/states";
import { cn } from "@/lib/utils";

export type StaffFile = {
  id: string;
  kind: "artwork" | "proof";
  version: number;
  fileName: string;
  sizeBytes: number;
  status: ArtworkStatus;
  checklist: Checklist;
  comments: string | null;
  uploadedByClient: boolean;
  createdAt: string;
  approval: { approvedAt: string; name: string; email: string | null; ip: string | null } | null;
};

export type StaffPiece = { id: string; label: string; files: StaffFile[] };

const RESULTS: readonly ChecklistResult[] = ["ok", "observed", "na"];

/**
 * Revisión del arte por el equipo (PRD §9): checklist de preprensa por punto,
 * comentarios para el cliente, estados, proof y liberación a fábrica. Solo el
 * equipo asignado y admin abren y revisan (`canOpen`).
 */
export function StaffArtwork({ requestId, pieces, canOpen, canEdit, limits }: { requestId: string; pieces: StaffPiece[]; canOpen: boolean; canEdit: boolean; limits: { maxMb: number } }) {
  const t = useTranslations("admin.artwork");
  return (
    <div className="space-y-6">
      {!canOpen ? (
        <p role="note" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {t("noAccess")}
        </p>
      ) : null}
      {pieces.map((piece) => {
        const approvedForProof = piece.files.some((f) => f.kind === "artwork" && f.status === "approved_for_proof");
        return (
          <section key={piece.id} aria-labelledby={`staff-art-${piece.id}`} className="rounded-lg border border-border bg-card">
            <h2 id={`staff-art-${piece.id}`} className="border-b border-border px-4 py-3 font-semibold">
              {piece.label}
            </h2>
            <div className="space-y-4 p-4">
              {piece.files.length === 0 ? <p className="text-sm text-muted-foreground">{t("noFiles")}</p> : null}
              {piece.files.map((f) =>
                f.kind === "artwork" ? (
                  <ArtworkReview key={f.id} requestId={requestId} file={f} canOpen={canOpen} canEdit={canEdit && canOpen} />
                ) : (
                  <ProofRow key={f.id} requestId={requestId} file={f} canOpen={canOpen} canEdit={canEdit && canOpen} />
                ),
              )}
              {canEdit && canOpen && approvedForProof ? <ProofUploader requestId={requestId} itemId={piece.id} maxMb={limits.maxMb} /> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OpenButtons({ fileId, canOpen }: { fileId: string; canOpen: boolean }) {
  const t = useTranslations("admin.artwork");
  if (!canOpen) return null;
  async function open(download: boolean) {
    const win = window.open("", "_blank");
    const url = await staffFileUrlAction(fileId, download);
    if (win && url) {
      win.opener = null;
      win.location.href = url;
    } else win?.close();
  }
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void open(false)}>
        <EyeIcon className="size-4" />
        {t("open")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => void open(true)}>
        <DownloadIcon className="size-4" />
        {t("download")}
      </Button>
    </div>
  );
}

function FileHeader({ file, title }: { file: StaffFile; title: string }) {
  const t = useTranslations("admin.artwork");
  const ts = useTranslations("artwork.statuses");
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold">
          {title}
          <span className="ml-2 font-normal text-muted-foreground">{file.fileName}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(file.createdAt)}
          {" · "}
          {file.uploadedByClient ? t("clientUpload") : t("staffUpload")}
        </p>
      </div>
      <span className="rounded-sm bg-muted px-2 py-0.5 text-xs font-semibold" data-testid="artwork-status">
        {ts(file.status)}
      </span>
    </div>
  );
}

function ArtworkReview({ requestId, file, canOpen, canEdit }: { requestId: string; file: StaffFile; canOpen: boolean; canEdit: boolean }) {
  const t = useTranslations("admin.artwork");
  const ta = useTranslations("artwork");
  const tc = useTranslations("artwork.checklist");
  const router = useRouter();
  const [checklist, setChecklist] = useState<Checklist>(file.checklist);
  const [comments, setComments] = useState(file.comments ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = STAFF_ARTWORK_TRANSITIONS[file.status];

  async function save(status: ArtworkStatus) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await reviewArtworkAction(requestId, file.id, { status, checklist, comments });
      if (result.ok) {
        setMessage({ tone: "ok", text: t("saved") });
        router.refresh();
      } else setMessage({ tone: "error", text: t(`errors.${result.error}`) });
    } catch {
      setMessage({ tone: "error", text: t("errors.generic") });
    } finally {
      setBusy(false);
    }
  }

  const setPoint = (key: (typeof CHECKLIST_KEYS)[number], patch: { result?: ChecklistResult; note?: string }) =>
    setChecklist((c) => {
      const current = c[key] ?? { result: "ok" as ChecklistResult };
      return { ...c, [key]: { ...current, ...patch } };
    });

  return (
    <article className="rounded-md border border-border p-3" data-testid="staff-artwork">
      <FileHeader file={file} title={ta("version", { n: file.version })} />
      <div className="mt-2">
        <OpenButtons fileId={file.id} canOpen={canOpen} />
      </div>
      {canEdit ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(file.status);
          }}
        >
          <fieldset>
            <legend className="text-sm font-semibold">{tc("title")}</legend>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {CHECKLIST_KEYS.map((key) => {
                const point = checklist[key];
                return (
                  <li key={key} className="grid gap-2 p-2 sm:grid-cols-[minmax(0,14rem)_auto_1fr] sm:items-center">
                    <span className="text-sm">{tc(key)}</span>
                    <div role="radiogroup" aria-label={tc(key)} className="flex gap-1">
                      {RESULTS.map((r) => (
                        <label
                          key={r}
                          className={cn(
                            "cursor-pointer rounded-md border px-2 py-1 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-forest",
                            point?.result === r ? (r === "observed" ? "border-signal-yellow bg-signal-yellow/20" : "border-forest bg-forest/10") : "border-border",
                          )}
                        >
                          <input type="radio" name={`${file.id}-${key}`} value={r} checked={point?.result === r} onChange={() => setPoint(key, { result: r })} className="sr-only" />
                          {tc(`results.${r}`)}
                        </label>
                      ))}
                    </div>
                    <input
                      aria-label={t("noteFor", { point: tc(key) })}
                      value={point?.note ?? ""}
                      onChange={(e) => setPoint(key, { note: e.target.value })}
                      disabled={!point}
                      maxLength={500}
                      placeholder={t("notePlaceholder")}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <div>
            <label htmlFor={`comments-${file.id}`} className="block text-sm font-semibold">
              {t("comments")}
            </label>
            <textarea
              id={`comments-${file.id}`}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              maxLength={4000}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={busy}>
              {t("save")}
            </Button>
            {targets.map((to) => (
              <Button key={to} type="button" disabled={busy} variant={to === "observed" ? "outline" : "default"} onClick={() => void save(to)}>
                {t(`to.${to as "in_review" | "observed" | "approved_for_proof"}`)}
              </Button>
            ))}
          </div>
          {message ? (
            <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-signal-green")}>
              {message.text}
            </p>
          ) : null}
        </form>
      ) : file.comments ? (
        <p className="mt-3 whitespace-pre-line rounded-md bg-muted px-3 py-2 text-sm">{file.comments}</p>
      ) : null}
    </article>
  );
}

function ProofRow({ requestId, file, canOpen, canEdit }: { requestId: string; file: StaffFile; canOpen: boolean; canEdit: boolean }) {
  const t = useTranslations("admin.artwork");
  const ta = useTranslations("artwork");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <article className="rounded-md border-2 border-kraft-light p-3" data-testid="staff-proof">
      <FileHeader file={file} title={ta("proof", { n: file.version })} />
      {file.approval ? (
        <p className="mt-2 text-sm font-medium" data-testid="staff-proof-approval">
          {t("approvedBy", {
            name: file.approval.name,
            date: formatDateTime(file.approval.approvedAt),
            ip: file.approval.ip ?? "—",
          })}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <OpenButtons fileId={file.id} canOpen={canOpen} />
        {canEdit && file.status === "proof_approved" ? (
          <Button
            type="button"
            onClick={async () => {
              setError(null);
              const result = await releaseProofAction(requestId, file.id).catch(() => ({ ok: false as const, error: "forbidden" as const }));
              if (result.ok) router.refresh();
              else setError(t(`errors.${result.error}`));
            }}
          >
            {t("to.released")}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </article>
  );
}

function ProofUploader({ requestId, itemId, maxMb }: { requestId: string; itemId: string; maxMb: number }) {
  const t = useTranslations("admin.artwork");
  const router = useRouter();
  return (
    <div className="rounded-md border-2 border-dashed border-border p-3">
      <FileUploader
        label={t("uploadProof")}
        hint={t("proofHint")}
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        extensions={["pdf", "png", "jpg", "jpeg"]}
        maxMb={maxMb}
        maxFiles={50}
        currentCount={0}
        testId={`proof-upload-${itemId}`}
        requestSlot={(file) => prepareProofUploadAction(requestId, itemId, { name: file.name, size: file.size })}
        confirm={(input) => confirmProofUploadAction(requestId, itemId, input)}
        onUploaded={() => router.refresh()}
      />
    </div>
  );
}
