"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FlaggedFile, FlaggedRecord } from "@/lib/artwork/retention";
import { formatDate } from "@/lib/format";
import { confirmDeletionAction, type DeletionState } from "./actions";

type Row = Omit<FlaggedFile, "flaggedAt"> & { flaggedAt: string };
type RecordRow = Omit<FlaggedRecord, "flaggedAt"> & { flaggedAt: string };

export function DeletionForm({ files, records }: { files: Row[]; records: RecordRow[] }) {
  const t = useTranslations("admin.files");
  const [state, action, pending] = useActionState<DeletionState, FormData>(confirmDeletionAction, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      {files.length > 0 ? (
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="p-2 text-left font-semibold">{t("artworkTitle")}</caption>
          <thead className="bg-muted/60 text-left">
            <tr>
              <th scope="col" className="w-10 p-2">
                <span className="sr-only">{t("select")}</span>
              </th>
              <th scope="col" className="p-2">{t("request")}</th>
              <th scope="col" className="p-2">{t("file")}</th>
              <th scope="col" className="p-2">{t("size")}</th>
              <th scope="col" className="p-2">{t("flaggedAt")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {files.map((f) => (
              <tr key={f.id}>
                <td className="p-2">
                  <input type="checkbox" name="file" value={f.id} aria-label={t("selectFile", { name: f.fileName })} className="size-4 accent-forest" />
                </td>
                <td className="p-2 font-medium">{f.requestNumber}</td>
                <td className="p-2">{f.fileName}</td>
                <td className="p-2 tabular">{`${new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(f.sizeBytes / (1024 * 1024))} MB`}</td>
                <td className="p-2">{formatDate(f.flaggedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : null}
      {records.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="retention-records">
            <caption className="p-2 text-left font-semibold">{t("recordsTitle")}</caption>
            <thead className="bg-muted/60 text-left">
              <tr>
                <th scope="col" className="w-10 p-2">
                  <span className="sr-only">{t("select")}</span>
                </th>
                <th scope="col" className="p-2">{t("request")}</th>
                <th scope="col" className="p-2">{t("kind")}</th>
                <th scope="col" className="p-2">{t("file")}</th>
                <th scope="col" className="p-2">{t("flaggedAt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="p-2">
                    <input type="checkbox" name="record" value={r.id} aria-label={t("selectFile", { name: r.fileName ?? t(`kinds.${r.kind}`) })} className="size-4 accent-forest" />
                  </td>
                  <td className="p-2 font-medium">{r.requestNumber ?? "—"}</td>
                  <td className="p-2">{t(`kinds.${r.kind}`)}</td>
                  <td className="p-2">{r.fileName ?? "—"}</td>
                  <td className="p-2">{formatDate(r.flaggedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("warning")}</p>
      <Button type="submit" variant="destructive" disabled={pending}>
        {t("confirm")}
      </Button>
      {state.status === "done" ? <p role="status" className="text-sm">{t("deleted", { n: state.deleted })}</p> : null}
      {state.status === "empty" ? <p role="alert" className="text-sm text-destructive">{t("empty")}</p> : null}
    </form>
  );
}
