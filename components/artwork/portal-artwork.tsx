"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, DownloadIcon, EyeIcon } from "lucide-react";
import { approveProofAction, confirmPortalUploadAction, portalFileUrlAction, preparePortalUploadAction } from "@/app/seguimiento/[token]/actions";
import { FileUploader } from "@/components/upload/file-uploader";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { CHECKLIST_KEYS, type ArtworkStatus, type Checklist } from "@/lib/artwork/states";
import { cn } from "@/lib/utils";

export type PortalFile = {
  id: string;
  kind: "artwork" | "proof";
  version: number;
  fileName: string;
  status: ArtworkStatus;
  checklist: Checklist;
  comments: string | null;
  createdAt: string;
  approval: { approvedAt: string; name: string } | null;
};

export type PortalPiece = { id: string; label: string; printing: boolean; files: PortalFile[] };

const STATUS_TONE: Record<ArtworkStatus, string> = {
  received: "bg-muted text-ink",
  in_review: "bg-kraft-light text-kraft-dark",
  observed: "bg-signal-yellow/20 text-ink",
  approved_for_proof: "bg-forest/10 text-forest",
  proof_sent: "bg-kraft-light text-kraft-dark",
  proof_approved: "bg-forest text-paper",
  released: "bg-forest text-paper",
};

function StatusBadge({ status }: { status: ArtworkStatus }) {
  const t = useTranslations("artwork.statuses");
  return <span className={cn("rounded-sm px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>{t(status)}</span>;
}

/**
 * Arte en el portal del cliente (PRD §9 y §10): versiones con su estado y
 * comentarios por punto del checklist, subida de una nueva versión y
 * aprobación del proof con fecha, hora, nombre e IP (registro inmutable).
 */
export function PortalArtwork({ token, pieces, contactName, limits }: { token: string; pieces: PortalPiece[]; contactName: string; limits: { maxMb: number; maxFiles: number } }) {
  const t = useTranslations("artwork");
  return (
    <div className="space-y-4">
      {pieces.map((piece) => (
        <article key={piece.id} className="rounded-lg border border-border" aria-labelledby={`art-${piece.id}`}>
          <h3 id={`art-${piece.id}`} className="border-b border-border bg-muted/50 px-4 py-3 font-bold">
            {piece.label}
          </h3>
          <div className="space-y-5 p-4">
            {piece.files.filter((f) => f.kind === "proof").map((f) => (
              <ProofCard key={f.id} token={token} file={f} contactName={contactName} />
            ))}
            {piece.files.some((f) => f.kind === "artwork") ? (
              <ul className="space-y-3">
                {piece.files.filter((f) => f.kind === "artwork").map((f) => (
                  <ArtworkVersion key={f.id} token={token} file={f} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("none")}</p>
            )}
            <div className="rounded-lg border-2 border-dashed border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">{t("newVersionHint")}</p>
              <PortalUploader token={token} itemId={piece.id} count={piece.files.filter((f) => f.kind === "artwork").length} limits={limits} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FileLinks({ token, file }: { token: string; file: PortalFile }) {
  const tu = useTranslations("upload");
  const t = useTranslations("artwork");
  async function open(download: boolean) {
    // Se abre la pestaña al instante (gesto del usuario) y luego se le da la URL firmada.
    const win = window.open("", "_blank");
    const url = await portalFileUrlAction(token, file.id, download);
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
        {tu("download")}
      </Button>
    </div>
  );
}

function ArtworkVersion({ token, file }: { token: string; file: PortalFile }) {
  const t = useTranslations("artwork");
  const tc = useTranslations("artwork.checklist");
  const observed = CHECKLIST_KEYS.filter((k) => file.checklist[k]?.result === "observed");
  return (
    <li className="rounded-md border border-border p-3" data-testid="artwork-version">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {t("version", { n: file.version })}
          <span className="ml-2 font-normal text-muted-foreground">{file.fileName}</span>
        </p>
        <StatusBadge status={file.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("uploadedAt", { date: formatDateTime(file.createdAt) })}</p>
      {observed.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">{t("observed")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {observed.map((k) => (
              <li key={k}>
                {tc(k)}
                {file.checklist[k]?.note ? `: ${file.checklist[k]?.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {file.comments ? (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
          <p className="font-semibold">{t("comments")}</p>
          <p className="mt-0.5 whitespace-pre-line">{file.comments}</p>
        </div>
      ) : null}
      <div className="mt-3">
        <FileLinks token={token} file={file} />
      </div>
    </li>
  );
}

function ProofCard({ token, file, contactName }: { token: string; file: PortalFile; contactName: string }) {
  const t = useTranslations("artwork");
  const router = useRouter();
  const [name, setName] = useState(contactName);
  const [state, setState] = useState<"idle" | "sending" | "error" | "name">("idle");
  const pending = file.status === "proof_sent";

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) {
      setState("name");
      return;
    }
    setState("sending");
    try {
      const result = await approveProofAction(token, file.id, name);
      if (!result.ok) {
        setState(result.error === "name" ? "name" : "error");
        return;
      }
      router.refresh();
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <section className={cn("rounded-lg p-4", pending ? "border-2 border-forest bg-forest/[0.04]" : "border border-border")} data-testid="proof-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold">{t("proof", { n: file.version })}</h4>
        <StatusBadge status={file.status} />
      </div>
      {file.approval ? (
        <p className="mt-2 flex items-start gap-2 text-sm font-medium" data-testid="proof-approved">
          <CheckCircle2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal-green" />
          {t("approved", { date: formatDateTime(file.approval.approvedAt), name: file.approval.name })}
        </p>
      ) : null}
      <div className="mt-3">
        <FileLinks token={token} file={file} />
      </div>
      {pending ? (
        <form onSubmit={approve} className="mt-4 space-y-3 border-t border-border pt-4" noValidate>
          <p className="font-semibold">{t("proofReady")}</p>
          <p className="text-sm text-muted-foreground">{t("proofReadyBody")}</p>
          <div>
            <label htmlFor={`approve-${file.id}`} className="block text-sm font-semibold">
              {t("approveName")}
            </label>
            <input
              id={`approve-${file.id}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setState("idle");
              }}
              autoComplete="name"
              maxLength={160}
              aria-invalid={state === "name" || undefined}
              aria-describedby={state === "name" || state === "error" ? `approve-${file.id}-error` : `approve-${file.id}-hint`}
              className="mt-1.5 block w-full rounded-md border border-input bg-paper px-3 py-2.5 text-base aria-invalid:border-destructive"
            />
            <p id={`approve-${file.id}-hint`} className="mt-1 text-xs text-muted-foreground">
              {t("approveNotice")}
            </p>
          </div>
          {state === "name" || state === "error" ? (
            <p id={`approve-${file.id}-error`} role="alert" className="text-sm font-medium text-destructive">
              {state === "name" ? t("approveNameRequired") : t("approveError")}
            </p>
          ) : null}
          <Button type="submit" disabled={state === "sending"}>
            {state === "sending" ? t("approving") : t("approve")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function PortalUploader({ token, itemId, count, limits }: { token: string; itemId: string; count: number; limits: { maxMb: number; maxFiles: number } }) {
  const t = useTranslations("artwork");
  const router = useRouter();
  return (
    <FileUploader
      label={t("newVersion")}
      hint={t("artworkHint")}
      accept=".pdf,.ai,.eps,.svg,application/pdf,application/postscript,image/svg+xml"
      extensions={["pdf", "ai", "eps", "svg"]}
      maxMb={limits.maxMb}
      maxFiles={limits.maxFiles}
      currentCount={count}
      testId={`portal-upload-${itemId}`}
      requestSlot={(file) => preparePortalUploadAction(token, itemId, { name: file.name, size: file.size })}
      confirm={(input) => confirmPortalUploadAction(token, itemId, input)}
      onUploaded={() => router.refresh()}
    />
  );
}
