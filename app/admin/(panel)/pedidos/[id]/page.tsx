import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileTextIcon } from "lucide-react";
import { OrderTimeline, PaymentsPanel, RecordMilestoneForm, ShippingForm, type PanelMilestone } from "@/components/panel/order-panel";
import { Button } from "@/components/ui/button";
import { EDITOR_ROLES, requireStaff } from "@/lib/auth";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { formatDate } from "@/lib/format";
import { todayInPanama } from "@/lib/leadtime";
import { getOrder, nextMilestones, orderQaChecklist } from "@/lib/orders";
import { formatMoney, formatUnitPrice } from "@/lib/quotes/pricing";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/admin/pedidos/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await getTranslations("admin.order");
  return { title: t("metaTitle", { number: id.slice(0, 8) }) };
}

function Section({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-lg border border-border bg-card", className)}>
      <h2 id={id} className="border-b border-border px-4 py-3 font-semibold">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

const plain = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Detalle del pedido (PRD §11): hitos con evidencias y QA, envío y pagos. */
export default async function OrderPage(props: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await props.params;
  const user = await requireStaff(undefined, `/admin/pedidos/${id}`);
  const order = await getOrder(user, id);
  if (!order) notFound();
  const t = await getTranslations("admin.order");
  const catalog = await getPublicCatalog();
  const canEdit = EDITOR_ROLES.includes(user.role);
  const day = (d: string) => formatDate(`${d}T17:00:00Z`);
  const today = todayInPanama();

  const milestones: PanelMilestone[] = await Promise.all(
    order.milestones.map(async (m) => ({
      id: m.id,
      type: m.type,
      occurredAt: m.occurredAt.toISOString(),
      responsible: m.responsible,
      notes: m.notes,
      qa: m.qaChecklist,
      evidence: await Promise.all(m.evidence.map(async (e) => ({ path: e.path, kind: e.kind, name: e.name, url: await signedUrl("evidence", e.path, { expiresIn: 600 }).catch(() => null) }))),
    })),
  );
  const paid = (kind: "deposit" | "balance") => order.payments.filter((p) => p.kind === kind && p.status === "confirmed").reduce((s, p) => s + (p.amount ?? 0), 0);
  const suggested = {
    deposit: plain(Math.max(0, order.depositAmount - paid("deposit"))),
    balance: plain(Math.max(0, order.balanceAmount - paid("balance"))),
  };
  const due = order.eta ?? order.estimatedDeliveryDate;

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/admin/pedidos" className="text-sm text-muted-foreground hover:underline">
        {t("back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="order-number">
          {order.number}
        </h1>
        <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-medium" data-testid="order-status">
          {t(`statuses.${order.status}`)}
        </span>
        {order.delayed ? <span className="rounded-md bg-signal-red/15 px-2 py-0.5 text-sm font-semibold text-signal-red">{t("delayed")}</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {order.company} ·{" "}
        <Link href={`/admin/solicitudes/${order.requestId}`} className="text-forest hover:underline">
          {t("request", { number: order.requestNumber })}
        </Link>{" "}
        · {t("quote", { number: order.quoteNumber })}
      </p>
      {!order.artworkReady && order.status === "deposit_received" ? (
        <p className="mt-3 rounded-md bg-signal-yellow/15 px-3 py-2 text-sm" role="status">
          {t("artworkPending")}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <Section id="timeline-title" title={t("timelineTitle")}>
            <OrderTimeline orderId={order.id} milestones={milestones} canEdit={canEdit} maxMb={uploadSettings(catalog).maxMb} />
          </Section>
          {canEdit ? (
            <Section id="record-title" title={t("recordTitle")}>
              <RecordMilestoneForm key={order.status} orderId={order.id} options={[...nextMilestones(order.status)]} qa={orderQaChecklist(order)} today={today} />
            </Section>
          ) : null}
          <Section id="payments-title" title={t("paymentsTitle")}>
            <PaymentsPanel
              orderId={order.id}
              canEdit={canEdit}
              suggested={suggested}
              defaultKind={order.depositConfirmed ? "balance" : "deposit"}
              today={today}
              payments={order.payments.map((p) => ({
                id: p.id,
                kind: p.kind,
                status: p.status,
                amount: p.amount,
                currency: p.currency,
                method: p.method,
                reference: p.reference,
                hasReceipt: p.hasReceipt,
                paidOn: p.paidOn,
                uploadedByClient: p.uploadedByClient,
                notes: p.notes,
                createdAt: p.createdAt.toISOString(),
              }))}
            />
          </Section>
        </div>

        <div className="space-y-6">
          <Section id="summary-title" title={t("summaryTitle")}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("total")}</dt>
                <dd className="tabular font-semibold">{formatMoney(order.total, order.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("deposit", { pct: order.depositPct })}</dt>
                <dd className="tabular">{formatMoney(order.depositAmount, order.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("balance")}</dt>
                <dd className="tabular">{formatMoney(order.balanceAmount, order.currency)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("leadTime")}</dt>
                <dd className="text-right">{t("leadTimeDays", { days: order.leadTimeDays })}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("estimated")}</dt>
                <dd className="text-right font-medium" data-testid="order-estimated">
                  {due ? day(due) : t("toBeConfirmed")}
                </dd>
              </div>
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href={`/api/documentos/pedido/${order.id}`} target="_blank" rel="noopener">
                <FileTextIcon className="size-4" />
                {t("statement")}
              </a>
            </Button>
          </Section>
          <Section id="items-title" title={t("itemsTitle")}>
            <ul className="space-y-1 text-sm">
              {order.items.map((i) => (
                <li key={i.id}>
                  {t("itemLine", { position: i.position, name: i.spec?.type?.name ?? "—", quantity: new Intl.NumberFormat("es-PA").format(i.quantity) })}
                  <span className="block text-xs text-muted-foreground tabular">
                    {formatUnitPrice(i.unitPrice, order.currency)} · {formatMoney(i.subtotal, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section id="shipping-title" title={t("shippingTitle")}>
            {canEdit ? (
              <ShippingForm orderId={order.id} initial={{ transport: order.transport ?? "", tracking: order.tracking ?? "", eta: order.eta ?? "", notes: order.notes ?? "" }} />
            ) : (
              <p className="text-sm whitespace-pre-line">{[order.transport, order.tracking, order.eta ? day(order.eta) : null, order.notes].filter(Boolean).join("\n") || "—"}</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
