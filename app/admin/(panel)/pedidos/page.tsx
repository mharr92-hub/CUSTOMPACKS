import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.orders");
  return { title: t("title") };
}

/** Pedidos (PRD §11): abiertos primero, por fecha de entrega; alerta de atraso. */
export default async function OrdersPage() {
  const user = await requireStaff(undefined, "/admin/pedidos");
  const t = await getTranslations("admin.orders");
  const to = await getTranslations("admin.order");
  const orders = await listOrders(user);
  const day = (d: string) => formatDate(`${d}T17:00:00Z`);

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {orders.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-card p-6 text-sm">{t("empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[820px] text-sm" data-testid="orders">
            <thead className="bg-muted/60 text-left text-xs">
              <tr>
                <th scope="col" className="p-2">{t("columns.number")}</th>
                <th scope="col" className="p-2">{t("columns.client")}</th>
                <th scope="col" className="p-2">{t("columns.status")}</th>
                <th scope="col" className="p-2">{t("columns.delivery")}</th>
                <th scope="col" className="p-2">{t("columns.payments")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-border align-top">
                  <td className="p-2 font-medium whitespace-nowrap">
                    <Link href={`/admin/pedidos/${o.id}`} className="text-forest hover:underline">
                      {o.number}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{o.requestNumber}</span>
                  </td>
                  <td className="max-w-56 truncate p-2" title={o.company}>
                    {o.company}
                  </td>
                  <td className="p-2 whitespace-nowrap">{to(`statuses.${o.status}`)}</td>
                  <td className="p-2 whitespace-nowrap">
                    {o.eta ?? o.estimatedDeliveryDate ? day((o.eta ?? o.estimatedDeliveryDate) as string) : t("toBeConfirmed")}
                    {o.delayed ? (
                      <span className="ml-2 rounded-md bg-signal-red/15 px-1.5 py-0.5 text-xs font-semibold text-signal-red" data-testid="order-delayed">
                        {t("delayed")}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <span className={cn("block", o.depositConfirmed ? "text-foreground" : "text-muted-foreground")}>
                      {t("deposit")}: {o.depositConfirmed ? t("ok") : t("pending")}
                    </span>
                    <span className={cn("block", o.balanceConfirmed ? "text-foreground" : "text-muted-foreground")}>
                      {t("balance")}: {o.balanceConfirmed ? t("ok") : t("pending")}
                    </span>
                    {o.pendingReceipts > 0 ? (
                      <span className="mt-1 inline-block rounded-md bg-signal-yellow/20 px-1.5 py-0.5 text-xs font-medium">{t("receipts", { n: o.pendingReceipts })}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
