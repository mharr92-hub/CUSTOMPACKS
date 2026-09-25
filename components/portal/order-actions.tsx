"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { confirmReceiptUploadAction, prepareReceiptUploadAction, submitSurveyAction } from "@/app/seguimiento/[token]/actions";
import { FileUploader } from "@/components/upload/file-uploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Comprobante de pago desde el enlace: queda "en revisión" hasta que el equipo lo confirma. */
export function ReceiptUpload({ token, maxMb }: { token: string; maxMb: number }) {
  const t = useTranslations("tracking.order");
  const router = useRouter();
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-2">
      <FileUploader
        label={t("uploadReceipt")}
        hint={t("receiptHint")}
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        extensions={["pdf", "png", "jpg", "jpeg", "webp"]}
        maxMb={maxMb}
        maxFiles={5}
        currentCount={0}
        limitsText={t("receiptLimits", { max: maxMb })}
        testId="receipt-upload"
        requestSlot={(file) => prepareReceiptUploadAction(token, { name: file.name, size: file.size })}
        confirm={(input) => confirmReceiptUploadAction(token, input)}
        onUploaded={() => {
          setSent(true);
          router.refresh();
        }}
      />
      {sent ? (
        <p role="status" className="text-sm font-medium text-forest">
          {t("receiptSent")}
        </p>
      ) : null}
    </div>
  );
}

/** Encuesta NPS (0 a 10) al entregar o cerrar el pedido. */
export function SurveyForm({ token }: { token: string }) {
  const t = useTranslations("tracking.order");
  const router = useRouter();
  const id = useId();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="font-medium text-forest" data-testid="survey-thanks">
        {t("surveyThanks")}
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      data-testid="survey-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (score === null) {
          setError(t("surveyError"));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          const result = await submitSurveyAction(token, { score, comment });
          if (result.ok) {
            setDone(true);
            router.refresh();
          } else setError(result.error === "score" ? t("surveyError") : t("surveyFailed"));
        } catch {
          setError(t("surveyFailed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset>
        <legend className="font-semibold">{t("surveyTitle")}</legend>
        <p className="text-sm text-muted-foreground" id={`${id}-hint`}>
          {t("surveyHint")}
        </p>
        <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-describedby={`${id}-hint`}>
          {Array.from({ length: 11 }, (_, n) => (
            <label
              key={n}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-md border text-base font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest",
                score === n ? "border-forest bg-forest text-white" : "border-border bg-background hover:border-forest",
              )}
            >
              <input type="radio" name={`${id}-score`} value={n} checked={score === n} onChange={() => setScore(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="grid gap-1 text-sm font-medium">
        {t("surveyComment")}
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={3} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {t("surveySend")}
      </Button>
    </form>
  );
}
