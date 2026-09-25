import { getTranslations } from "next-intl/server";
import { FileTextIcon, RotateCcwIcon } from "lucide-react";
import { EvidenceList } from "@/components/orders/evidence-list";
import { ReceiptUpload, SurveyForm } from "@/components/portal/order-actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ClientOrder as ClientOrderData } from "@/lib/orders";
import { formatMoney } from "@/lib/quotes/pricing";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";

const day = (d: string) => formatDate(`${d}T17:00:00Z`);

const PAYMENT_TONE = { none: "bg-muted", pending: "bg-signal-yellow/20", confirmed: "bg-signal-green/15", rejected: "bg-signal-red/15" } as const;

/**
 * Pedido visto por el cliente (PRD §10): etapas con fotos y QA, montos de la
 * cotización aceptada y estado de cada pago (D-101), documentos, comprobante,
 * "Pedir de nuevo" y encuesta.
 */
export async function ClientOrder({ order, token, specHref, maxMb, taxLabel }: { order: ClientOrderData; token: string; specHref: string; maxMb: number; taxLabel: string }) {
  const t = await getTranslations("tracking.order");
  const due = order.eta ?? order.estimatedDeliveryDate;
  const open = order.status !== "closed";
  const needsPayment = open && (order.payments.deposit !== "confirmed" || (order.status === "delivered" && order.payments.balance !== "confirmed"));
  const money = (n: number) => formatMoney(n, order.amounts.currency);

  return (
    <section aria-labelledby="order-title" className="mt-6 space-y-6 rounded-lg border-2 border-forest p-5" data-testid="client-order">
      <div>
        <h2 id="order-title" className="text-xl font-bold">
          {t("title", { number: order.number })}
        </h2>
        <p className="mt-2 text-sm font-semibold text-muted-foreground">{t("status")}</p>
        <p className="text-2xl font-bold" data-testid="order-status">
          {t(`statuses.${order.status}`)}
        </p>
        <p className="mt-1">{order.deliveredAt ? t("deliveredOn", { date: formatDate(order.deliveredAt) }) : due ? t("estimated", { date: day(due) }) : t("toBeConfirmed")}</p>
        {order.transport ? <p className="text-sm text-muted-foreground">{t("shipping", { transport: order.transport })}</p> : null}
        {order.tracking ? <p className="text-sm text-muted-foreground">{t("tracking", { tracking: order.tracking })}</p> : null}
      </div>

      <div>
        <h3 className="font-bold">{t("timeline")}</h3>
        <ol className="mt-3 border-l-2 border-dashed border-forest/40 pl-5" data-testid="client-order-timeline">
          {order.milestones.map((m) => (
            <li key={m.id} className="relative pb-5 last:pb-0" data-testid={`client-milestone-${m.type}`}>
              <span aria-hidden="true" className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-forest" />
              <p className="font-semibold">{t(`milestoneTypes.${m.type}`)}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(m.occurredAt)}</p>
              {m.notes ? <p className="mt-1 text-sm whitespace-pre-line">{m.notes}</p> : null}
              {m.qa ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-forest">{t("qa")}</summary>
                  <ul className="mt-1 space-y-0.5">
                    {m.qa.map((p) => (
                      <li key={p.label}>
                        {p.label}: {p.expected} ·{" "}
                        <span className={cn(p.result === "observed" && "font-semibold")}>{p.result ? t(`qaResults.${p.result as "ok"}`) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <EvidenceList
                evidence={m.evidence.map((e) => ({ path: e.path, kind: e.kind, name: e.name, url: e.url }))}
                alt={t("photoAlt", { milestone: t(`milestoneTypes.${m.type}`) })}
                videoLabel={t("video")}
                fileLabel={t("file")}
              />
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="font-bold">{t("paymentsTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("paymentsIntro", { deposit: order.depositPct, balance: 100 - order.depositPct })}</p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2" data-testid="client-order-total">
          <span className="text-sm font-semibold">{t("total")}</span>
          <span className="tabular text-lg font-bold">{money(order.amounts.total)}</span>
          {taxLabel ? <span className="text-sm text-muted-foreground">{taxLabel}</span> : null}
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {(["deposit", "balance"] as const).map((kind) => {
            const amount = kind === "deposit" ? order.amounts.deposit : order.amounts.balance;
            const paidAmount = kind === "deposit" ? order.amounts.paidDeposit : order.amounts.paidBalance;
            const pct = kind === "deposit" ? order.depositPct : 100 - order.depositPct;
            return (
              <div key={kind} className={cn("rounded-md px-3 py-2", PAYMENT_TONE[order.payments[kind]])} data-testid={`client-payment-${kind}`}>
                <dt className="text-sm font-semibold">{t(`${kind}Pct`, { pct })}</dt>
                <dd className="tabular text-lg font-bold">{money(amount)}</dd>
                <dd>{t(`paymentStatuses.${order.payments[kind]}`)}</dd>
                {paidAmount > 0 && paidAmount < amount ? (
                  <dd className="text-sm text-muted-foreground">{t("paidPending", { paid: money(paidAmount), pending: money(Math.max(0, amount - paidAmount)) })}</dd>
                ) : null}
              </div>
            );
          })}
        </dl>
        {taxLabel ? <p className="mt-2 text-xs text-muted-foreground">{t("taxNote", { label: taxLabel })}</p> : null}
        {order.paymentList.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-sm font-semibold">{t("paymentHistory")}</h4>
            <ul className="mt-1 divide-y divide-border text-sm" data-testid="client-payment-list">
              {order.paymentList.map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>
                    {t(p.kind)} · {p.paidOn ? day(p.paidOn) : formatDateTime(p.createdAt)}
                    {p.uploadedByClient ? ` · ${t("receiptByYou")}` : ""}
                  </span>
                  <span className="tabular">
                    {p.amount !== null ? `${money(p.amount)} · ` : ""}
                    {t(`paymentStatuses.${p.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {needsPayment ? (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold">{t("instructions")}</h4>
              {order.paymentInstructions ? (
                <p className="mt-1 text-sm whitespace-pre-line" data-testid="payment-instructions">
                  {order.paymentInstructions}
                </p>
              ) : (
                <p className="mt-1 text-sm">
                  {t("noInstructions")}{" "}
                  <a href={whatsappLink(t("paymentHelp", { brand: brand.name, number: order.number }))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-forest underline">
                    <WhatsAppIcon className="size-4" />
                    {t("whatsapp")}
                  </a>
                </p>
              )}
            </div>
            <ReceiptUpload token={token} maxMb={maxMb} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <a href={`/api/documentos/pedido/${order.id}?t=${token}`} target="_blank" rel="noopener" data-testid="statement-link">
            <FileTextIcon className="size-4" />
            {t("statement")}
          </a>
        </Button>
        {order.quoteId ? (
          <Button asChild variant="outline">
            <a href={`/api/documentos/cotizacion/${order.quoteId}?t=${token}`} target="_blank" rel="noopener">
              <FileTextIcon className="size-4" />
              {t("quote")}
            </a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <a href={specHref} target="_blank" rel="noopener">
            <FileTextIcon className="size-4" />
            {t("spec")}
          </a>
        </Button>
      </div>

      <div>
        <Button asChild>
          <a href={`/cotizar?repetir=${token}`} data-testid="reorder-link">
            <RotateCcwIcon className="size-4" />
            {t("reorder")}
          </a>
        </Button>
        <p className="mt-1 text-sm text-muted-foreground">{t("reorderHint")}</p>
      </div>

      {order.status === "delivered" || order.status === "closed" ? (
        <div id="encuesta" className="scroll-mt-6 rounded-md bg-muted/50 p-4">
          {order.surveyDone ? (
            <p className="font-medium text-forest" data-testid="survey-thanks">
              {t("surveyThanks")}
            </p>
          ) : (
            <SurveyForm token={token} />
          )}
        </div>
      ) : null}
    </section>
  );
}
