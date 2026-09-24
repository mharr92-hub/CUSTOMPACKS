"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EntityKey } from "@/lib/catalog/entities";
import { removePhotoAction, uploadPhotoAction, type FormState } from "../actions";

function UploadForm({ entityKey, id, mode, label }: { entityKey: EntityKey; id: string; mode: "main" | "extra"; label: string }) {
  const t = useTranslations("admin.catalog");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(uploadPhotoAction.bind(null, entityKey, id, mode), { status: "idle" });
  useEffect(() => {
    if (state.status === "saved") {
      toast.success(t("saved"));
      formRef.current?.reset();
    }
  }, [state, t]);
  const inputId = `file-${mode}`;
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor={inputId} className="sr-only">
        {t("actions.chooseFile")}
      </label>
      <input
        id={inputId}
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required
        className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? t("actions.saving") : label}
      </Button>
      {state.status === "error" && state.error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.generic")}
        </p>
      ) : null}
    </form>
  );
}

export function PhotoManager({
  entityKey,
  id,
  photoUrl,
  photos,
  hasGallery,
}: {
  entityKey: EntityKey;
  id: string;
  photoUrl: string | null;
  photos: string[];
  hasGallery: boolean;
}) {
  const t = useTranslations("admin.catalog");
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("fields.photo")}</h2>
        {photoUrl ? (
          <div className="flex items-end gap-3">
            <Image src={photoUrl} alt="" width={160} height={120} unoptimized className="h-30 w-40 rounded-md border border-border object-cover" />
            <form action={removePhotoAction.bind(null, entityKey, id, "main", photoUrl)}>
              <Button type="submit" size="sm" variant="ghost">
                {t("actions.removePhoto")}
              </Button>
            </form>
          </div>
        ) : null}
        <UploadForm entityKey={entityKey} id={id} mode="main" label={t("actions.uploadPhoto")} />
        <p className="text-xs text-muted-foreground">{t("photoHelp")}</p>
      </section>
      {hasGallery ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("fields.photos")}</h2>
          {photos.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {photos.map((url) => (
                <li key={url} className="space-y-1">
                  <Image src={url} alt="" width={120} height={90} unoptimized className="h-22 w-30 rounded-md border border-border object-cover" />
                  <form action={removePhotoAction.bind(null, entityKey, id, "extra", url)}>
                    <Button type="submit" size="xs" variant="ghost">
                      {t("actions.removePhoto")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <UploadForm entityKey={entityKey} id={id} mode="extra" label={t("actions.uploadExtra")} />
        </section>
      ) : null}
    </div>
  );
}
