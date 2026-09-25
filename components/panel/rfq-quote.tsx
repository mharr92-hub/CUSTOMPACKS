"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createQuoteDraftAction,
  generateRfqAction,
  issueQuoteAction,
  quoteFileUrlAction,
  recordRfqResponseAction,
  rfqFileUrlAction,
  sendRfqAction,
  updateQuoteDraftAction,
} from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatMoney, formatUnitPrice, parseMoney, priceLine } from "@/lib/quotes/pricing";
import { cn } from "@/lib/utils";

export type PanelItem = { id: string; position: number; label: string; quantities: number[] };
export type PanelRfq = {
  id: string;
  number: string;
  createdAt: string;
  sentAt: string | null;
  sentTo: string | null;
  respondedAt: string | null;
  costs: { itemId: string; quantity: number; unitCost: number }[];
  currency: string;
  productionDays: number | null;
  notes: string | null;
};
export type PanelQuote = {
  id: string;
  number: string;
  status: "draft" | "sent" | "changes_requested" | "accepted" | "rejected" | "expired" | "superseded";
  lines: { itemId: string; position: number; quantity: number; unitCost: number; freightTotal: number; marginPct: number; unitPrice: number; subtotal: number; leadTimeDays: number }[];
  currency: string;
  validUntil: string;
  notes: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedSelection: { itemId: string; quantity: number }[] | null;
  hasPdf: boolean;
};

type Result = { ok: true } | { ok: false; error: string; pieces?: number[] };

function useRun(ns: "admin.rfq" | "admin.quote") {
  const t = useTranslations(ns);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<Result>, okMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        if (okMessage) toast.success(okMessage);
        router.refresh();
      } else {
        const key = `errors.${result.error}` as "errors.generic";
        setError(t.has(key) ? t(key, { pieces: (result.pieces ?? []).join(", ") } as never) : t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

async function openSigned(fn: () => Promise<string | null>) {
  const win = window.open("", "_blank");
  const url = await fn();
  if (win && url) {
    win.opener = null;
    win.location.href = url;
  } else win?.close();
}

const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);

// ---------------------------------------------------------------------------
// RFQ
// ---------------------------------------------------------------------------
export function RfqPanel({ requestId, items, rfqs, canEdit, canGenerate, factoryEmail }: { requestId: string; items: PanelItem[]; rfqs: PanelRfq[]; canEdit: boolean; canGenerate: boolean; factoryEmail: boolean }) {
  const t = useTranslations("admin.rfq");
  const { error, busy, run } = useRun("admin.rfq");
  return (
    <div className="space-y-4" data-testid="rfq-panel">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {canEdit && canGenerate ? (
        <Button type="button" disabled={busy} onClick={() => void run(() => generateRfqAction(requestId))}>
          {t("generate")}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {rfqs.length === 0 ? <p className="text-sm text-muted-foreground">{t("none")}</p> : null}
      {!factoryEmail && rfqs.length > 0 ? <p className="rounded-md bg-signal-yellow/15 px-3 py-2 text-sm">{t("noFactoryEmail")}</p> : null}
      {rfqs.map((rfq, index) => (
        <article key={rfq.id} className="rounded-md border border-border p-3" data-testid="rfq">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{t("version", { number: rfq.number })}</p>
              <p className="text-xs text-muted-foreground">
                {t("created", { date: formatDateTime(rfq.createdAt) })}
                {" · "}
                {rfq.sentAt ? t("sent", { to: rfq.sentTo ?? "", date: formatDateTime(rfq.sentAt) }) : t("notSent")}
                {rfq.respondedAt ? ` · ${t("answered", { date: formatDateTime(rfq.respondedAt) })}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void openSigned(() => rfqFileUrlAction(rfq.id, "pdf"))}>
                {t("pdf")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void openSigned(() => rfqFileUrlAction(rfq.id, "xlsx"))}>
                {t("xlsx")}
              </Button>
              {canEdit && factoryEmail ? (
                <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => sendRfqAction(requestId, rfq.id))}>
                  {rfq.sentAt ? t("resend") : t("send")}
                </Button>
              ) : null}
            </div>
          </div>
          {canEdit && index === 0 ? <RfqResponseForm requestId={requestId} rfq={rfq} items={items} /> : null}
        </article>
      ))}
    </div>
  );
}

function RfqResponseForm({ requestId, rfq, items }: { requestId: string; rfq: PanelRfq; items: PanelItem[] }) {
  const t = useTranslations("admin.rfq");
  const { error, busy, run } = useRun("admin.rfq");
  const [open, setOpen] = useState(!rfq.respondedAt);
  const initial = Object.fromEntries(items.flatMap((i) => i.quantities.map((q) => [`${i.id}:${q}`, String(rfq.costs.find((c) => c.itemId === i.id && c.quantity === q)?.unitCost ?? "")])));
  const [costs, setCosts] = useState<Record<string, string>>(initial);
  const [currency, setCurrency] = useState(rfq.currency || "USD");
  const [days, setDays] = useState(rfq.productionDays ? String(rfq.productionDays) : "");
  const [notes, setNotes] = useState(rfq.notes ?? "");
  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        {t("editResponse")}
      </Button>
    );
  }
  return (
    <form
      className="mt-3 space-y-3 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          recordRfqResponseAction(requestId, rfq.id, {
            costs: items.flatMap((i) => i.quantities.map((q) => ({ itemId: i.id, quantity: q, unitCost: costs[`${i.id}:${q}`] ?? "" }))),
            currency,
            productionDays: days,
            notes,
          }),
        );
      }}
    >
      <p className="text-sm font-semibold">{t("response")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.flatMap((i) =>
          i.quantities.map((q) => (
            <label key={`${i.id}:${q}`} className="grid gap-1 text-xs font-medium">
              {`${t("piece", { n: i.position })} · ${i.label} · ${t("quantity", { n: fmtInt(q) })} · ${t("unitCost")}`}
              <Input inputMode="decimal" value={costs[`${i.id}:${q}`] ?? ""} onChange={(e) => setCosts((c) => ({ ...c, [`${i.id}:${q}`]: e.target.value }))} data-testid="rfq-cost" />
            </label>
          )),
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-[8rem_10rem_1fr]">
        <label className="grid gap-1 text-xs font-medium">
          {t("currency")}
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("productionDays")}
          <Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("notes")}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={busy}>
        {t("saveResponse")}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cotización
// ---------------------------------------------------------------------------
export function QuotePanel({
  requestId,
  items,
  quotes,
  canEdit,
  canPrepare,
  taxLabel,
}: {
  requestId: string;
  items: PanelItem[];
  quotes: PanelQuote[];
  canEdit: boolean;
  canPrepare: boolean;
  /** Leyenda de impuestos (settings.tax_label). */
  taxLabel: string;
}) {
  const t = useTranslations("admin.quote");
  const { error, busy, run } = useRun("admin.quote");
  const draft = quotes.find((q) => q.status === "draft");
  const latest = quotes[0];
  const itemLabel = (id: string) => items.find((i) => i.id === id);
  return (
    <div className="space-y-4" data-testid="quote-panel">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      {canEdit && canPrepare && !draft && latest?.status !== "accepted" ? (
        <Button type="button" disabled={busy} onClick={() => void run(() => createQuoteDraftAction(requestId))}>
          {latest ? t("newVersion") : t("prepare")}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {draft && canEdit ? <QuoteEditor requestId={requestId} quote={draft} items={items} taxLabel={taxLabel} /> : null}
      {quotes.filter((q) => q.status !== "draft").length ? (
        <div>
          <p className="text-sm font-semibold">{t("versions")}</p>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
            {quotes
              .filter((q) => q.status !== "draft")
              .map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-2" data-testid="quote-version">
                  <div>
                    <span className="font-medium">{q.number}</span>
                    <span className={cn("ml-2 rounded-sm px-1.5 py-0.5 text-xs font-semibold", q.status === "accepted" ? "bg-forest text-paper" : "bg-muted")} data-testid="quote-status">
                      {t(`statuses.${q.status}`)}
                    </span>
                    {q.acceptedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t("acceptedBy", { date: formatDateTime(q.acceptedAt), name: q.acceptedByName ?? "" })}
                        {q.acceptedSelection
                          ? ` · ${t("selection", {
                              items: q.acceptedSelection.map((s) => `${itemLabel(s.itemId)?.position ?? ""}: ${fmtInt(s.quantity)}`).join(", "),
                            })}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  {q.hasPdf ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void openSigned(() => quoteFileUrlAction(q.id))}>
                      {t("pdf")}
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type EditLine = { itemId: string; position: number; quantity: number; unitCost: string; freightTotal: string; marginPct: string; leadTimeDays: string };

function QuoteEditor({ requestId, quote, items, taxLabel }: { requestId: string; quote: PanelQuote; items: PanelItem[]; taxLabel: string }) {
  const t = useTranslations("admin.quote");
  const { error, busy, run } = useRun("admin.quote");
  const [lines, setLines] = useState<EditLine[]>(
    quote.lines.map((l) => ({
      itemId: l.itemId,
      position: l.position,
      quantity: l.quantity,
      unitCost: String(l.unitCost || ""),
      freightTotal: String(l.freightTotal),
      marginPct: String(l.marginPct),
      leadTimeDays: String(l.leadTimeDays),
    })),
  );
  const [validUntil, setValidUntil] = useState(quote.validUntil);
  const [notes, setNotes] = useState(quote.notes ?? "");
  const payload = () => ({ lines, validUntil, notes });
  const set = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const cell = "h-9 w-full rounded-md border border-input bg-background px-2 text-right text-sm font-normal";
  return (
    <div className="space-y-3 rounded-md border-2 border-dashed border-forest/40 p-3" data-testid="quote-editor">
      <p className="font-semibold">{t("draftOf", { number: quote.number })}</p>
      {/* Una tarjeta por línea (pieza × cantidad): cabe en la columna del detalle sin desplazamiento lateral. */}
      <div className="space-y-3">
        {lines.map((l, i) => {
          const price = priceLine({ quantity: l.quantity, unitCost: parseMoney(l.unitCost) ?? 0, freightTotal: parseMoney(l.freightTotal) ?? -1, marginPct: parseMoney(l.marginPct) ?? -1 });
          const item = items.find((it) => it.id === l.itemId);
          const suffix = `${l.position} · ${fmtInt(l.quantity)}`;
          return (
            <fieldset key={`${l.itemId}:${l.quantity}`} className="rounded-md border border-border p-3" data-testid="quote-line">
              <legend className="px-1 text-sm font-semibold">{t("lineTitle", { position: l.position, name: item?.label ?? "", quantity: fmtInt(l.quantity) })}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="grid gap-1 text-xs font-medium">
                  {t("unitCost")}
                  <input aria-label={`${t("unitCost")} ${suffix}`} inputMode="decimal" className={cell} value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  {t("freight")}
                  <input aria-label={`${t("freight")} ${suffix}`} inputMode="decimal" className={cell} value={l.freightTotal} onChange={(e) => set(i, { freightTotal: e.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  {t("margin")}
                  <input aria-label={`${t("margin")} ${suffix}`} inputMode="decimal" className={cell} value={l.marginPct} onChange={(e) => set(i, { marginPct: e.target.value })} />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  {t("leadTime")}
                  <input aria-label={`${t("leadTime")} ${suffix}`} inputMode="numeric" className={cell} value={l.leadTimeDays} onChange={(e) => set(i, { leadTimeDays: e.target.value })} />
                </label>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("unitPrice")}</dt>
                  <dd className="tabular font-semibold" data-testid="quote-unit-price">
                    {price ? formatUnitPrice(price.unitPrice, quote.currency) : "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("subtotal")}</dt>
                  <dd className="tabular font-semibold">{price ? formatMoney(price.subtotal, quote.currency) : "—"}</dd>
                </div>
                {taxLabel ? (
                  <div className="text-muted-foreground" data-testid="quote-tax-label">
                    {taxLabel}
                  </div>
                ) : null}
              </dl>
            </fieldset>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <label className="grid gap-1 text-xs font-medium">
          {t("validUntil")}
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <span className="font-normal text-muted-foreground">{validUntil ? formatDate(`${validUntil}T17:00:00Z`) : ""}</span>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("notes")}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={4000} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => updateQuoteDraftAction(requestId, quote.id, payload()), t("saved"))}>
          {t("save")}
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const saved = await updateQuoteDraftAction(requestId, quote.id, payload());
              return saved.ok ? issueQuoteAction(requestId, quote.id) : saved;
            }, t("issued"))
          }
        >
          {t("issue")}
        </Button>
      </div>
    </div>
  );
}
