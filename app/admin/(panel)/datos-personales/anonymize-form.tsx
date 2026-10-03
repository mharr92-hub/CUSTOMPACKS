"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anonymizeAction } from "./actions";

/** Doble confirmación: abrir y escribir el número de la solicitud. No se puede deshacer. */
export function AnonymizeForm({ requestId, number }: { requestId: string; number: string }) {
  const t = useTranslations("admin.personalData");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("anonymize")}
      </Button>
    );
  }
  return (
    <form
      className="mt-2 space-y-2 rounded-md border border-destructive/40 p-3"
      data-testid="anonymize-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await anonymizeAction(requestId, confirm);
          if (result.ok) {
            toast.success(t("done", { files: result.files }));
            setOpen(false);
            router.refresh();
          } else setError(t(`errors.${result.error}`));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm">{t("warning")}</p>
      <label className="grid gap-1 text-xs font-medium">
        {t("confirmLabel", { number })}
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={busy}>
          {t("confirm")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
