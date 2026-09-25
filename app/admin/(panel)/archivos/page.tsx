import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listFlaggedArtwork } from "@/lib/artwork/retention";
import { requireStaff } from "@/lib/auth";
import { DeletionForm } from "./deletion-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.files");
  return { title: t("title") };
}

/** Retención del arte: lo que marcó el cron y espera la confirmación de admin (PRD §9). */
export default async function FilesPage() {
  const user = await requireStaff(["admin"], "/admin/archivos");
  const t = await getTranslations("admin.files");
  const files = await listFlaggedArtwork(user);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-6">
        {files.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-4 text-sm">{t("none")}</p>
        ) : (
          <DeletionForm files={files.map((f) => ({ ...f, flaggedAt: f.flaggedAt.toISOString() }))} />
        )}
      </div>
    </div>
  );
}
