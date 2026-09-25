import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.orders");
  return { title: t("title") };
}

/** Pedidos (§11). Se llenan cuando el cliente acepta una cotización. */
export default async function OrdersPage() {
  await requireStaff(undefined, "/admin/pedidos");
  const t = await getTranslations("admin.orders");
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-4 rounded-lg border border-border bg-card p-6 text-sm">{t("empty")}</p>
    </div>
  );
}
