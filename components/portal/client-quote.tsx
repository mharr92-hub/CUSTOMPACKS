"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, FileTextIcon } from "lucide-react";
import { acceptQuoteAction, requestQuoteChangesAction } from "@/app/seguimiento/[token]/actions";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";

export type PortalQuote = {
  id: string;
  number: string;
  status: "sent" | "changes_requested" | "accepted" | "rejected" | "expired" | "draft" | "superseded";
  validUntil: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedSelection: { itemId: string; quantity: number }[] | null;
  options: { itemId: string; position: number; label: string; quantities: number[] }[];
};

const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);

/**
 * Cotización en el portal (PRD §10): los precios solo están en el PDF (regla
 * de CLAUDE.md: nunca un precio en pantalla). Aquí se descarga, se elige la
 * cantidad de cada pieza y se acepta con un clic, o se piden cambios.
 */
export function ClientQuote({ token, quote, contactName, taxLabel }: { token: string; quote: PortalQuote; contactName: string; taxLabel: string }) {
  const t = useTranslations("tracking.quote");
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, number>>(() =>
    Object.fromEntries(quote.options.filter((o) => o.quantities.length === 1).map((o) => [o.itemId, o.quantities[0] as number])),
  );
  const [name, setName] = useState(contactName);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState("");
  const [changesState, setChangesState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const pdfHref = `/api/documentos/cotizacion/${quote.id}?t=${token}`;
  const validDate = formatDate(`${quote.validUntil}T17:00:00Z`);
  const label = (itemId: string) => quote.options.find((o) => o.itemId === itemId);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const chosen = quote.options.map((o) => ({ itemId: o.itemId, quantity: selection[o.itemId] ?? 0 }));
    if (chosen.some((c) => !c.quantity)) {
      setError(t("errors.selection"));
      return;
    }
    if (name.trim().length < 3) {
      setError(t("errors.name"));
      return;
    }
    setState("sending");
    try {
      const result = await acceptQuoteAction(token, quote.id, { name, selection: chosen });
      if (result.ok) {
        router.refresh();
        setState("idle");
      } else {
        setState("error");
        setError(t.has(`errors.${result.error}` as never) ? t(`errors.${result.error}` as "errors.generic") : t("errors.generic"));
      }
    } catch {
      setState("error");
      setError(t("errors.generic"));
    }
  }

  async function sendChanges(e: React.FormEvent) {
    e.preventDefault();
    if (changes.trim().length < 3) {
      setChangesState("error");
      return;
    }
    setChangesState("sending");
    try {
      const result = await requestQuoteChangesAction(token, quote.id, changes);
      setChangesState(result.ok ? "sent" : "error");
      if (result.ok) router.refresh();
    } catch {
      setChangesState("error");
    }
  }

  return (
    <section aria-labelledby="quote-title" className="mt-6 rounded-lg border-2 border-forest p-5" data-testid="client-quote">
      <h2 id="quote-title" className="text-lg font-bold">
        {t("title")}
      </h2>
      <p className="mt-1">{t("ready", { number: quote.number })}</p>
      {taxLabel ? <p className="mt-1 text-sm text-muted-foreground">{t("taxNote", { label: taxLabel })}</p> : null}
      <Button asChild variant="outline" className="mt-3">
        <a href={pdfHref} target="_blank" rel="noopener">
          <FileTextIcon className="size-4" />
          {t("download")}
        </a>
      </Button>

      {quote.status === "accepted" ? (
        <div className="mt-4 space-y-1 text-sm" data-testid="quote-accepted">
          <p className="flex items-start gap-2 font-medium">
            <CheckCircle2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal-green" />
            {t("accepted", { number: quote.number, date: quote.acceptedAt ? formatDateTime(quote.acceptedAt) : "" })}
          </p>
          {quote.acceptedSelection ? (
            <p>{t("acceptedChoice", { items: quote.acceptedSelection.map((s) => `${label(s.itemId)?.label ?? label(s.itemId)?.position ?? ""}: ${fmtInt(s.quantity)}`).join(" · ") })}</p>
          ) : null}
        </div>
      ) : quote.status === "expired" ? (
        <p className="mt-4 text-sm font-medium">{t("expired", { date: validDate })}</p>
      ) : quote.status === "rejected" ? (
        <p className="mt-4 text-sm font-medium">{t("rejected")}</p>
      ) : quote.status === "changes_requested" ? (
        <p className="mt-4 text-sm font-medium">{t("changesPending")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t("validUntil", { date: validDate })}</p>
          <form onSubmit={accept} className="mt-4 space-y-4" noValidate>
            <fieldset>
              <legend className="font-semibold">{t("chooseTitle")}</legend>
              <div className="mt-2 space-y-3">
                {quote.options.map((o) => (
                  <div key={o.itemId} role="radiogroup" aria-label={`${o.position}. ${o.label}`}>
                    <p className="text-sm font-medium">{`${o.position}. ${o.label}`}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {o.quantities.map((q) => (
                        <label key={q} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-forest has-[:checked]:bg-forest/5">
                          <input type="radio" name={`qty-${o.itemId}`} value={q} checked={selection[o.itemId] === q} onChange={() => setSelection((s) => ({ ...s, [o.itemId]: q }))} className="accent-forest" />
                          {t("units", { n: fmtInt(q) })}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="quote-name" className="block text-sm font-semibold">
                {t("name")}
              </label>
              <input
                id="quote-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={160}
                aria-describedby="quote-notice"
                className="mt-1.5 block w-full rounded-md border border-input bg-paper px-3 py-2.5 text-base"
              />
              <p id="quote-notice" className="mt-1 text-xs text-muted-foreground">
                {t("notice")}
              </p>
            </div>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={state === "sending"}>
              {state === "sending" ? t("accepting") : t("accept")}
            </Button>
          </form>

          <details className="mt-5 border-t border-border pt-4">
            <summary className="cursor-pointer font-semibold">{t("changes")}</summary>
            {changesState === "sent" ? (
              <p role="status" className="mt-2 text-sm font-medium text-signal-green">
                {t("changesSent")}
              </p>
            ) : (
              <form onSubmit={sendChanges} className="mt-2 space-y-2" noValidate>
                <label htmlFor="quote-changes" className="block text-sm">
                  {t("changesHint")}
                </label>
                <textarea
                  id="quote-changes"
                  value={changes}
                  onChange={(e) => setChanges(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  className="block w-full rounded-md border border-input bg-paper px-3 py-2.5 text-base"
                />
                {changesState === "error" ? (
                  <p role="alert" className="text-sm text-destructive">
                    {changes.trim().length < 3 ? t("errors.body") : t("errors.generic")}
                  </p>
                ) : null}
                <Button type="submit" variant="outline" disabled={changesState === "sending"}>
                  {t("changesSend")}
                </Button>
              </form>
            )}
          </details>
        </>
      )}
    </section>
  );
}
