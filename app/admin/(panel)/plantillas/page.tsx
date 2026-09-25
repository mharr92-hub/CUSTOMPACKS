import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InactiveBadge, ProvisionalBadge } from "@/components/admin/provisional-badge";
import { requireStaff } from "@/lib/auth";
import { listTemplates } from "@/lib/notify/templates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.templates");
  return { title: t("title") };
}

/** Plantillas de mensajes por evento (§12 y §21-C). */
export default async function TemplatesPage() {
  const user = await requireStaff(undefined, "/admin/plantillas");
  const t = await getTranslations("admin.templates");
  const templates = await listTemplates(user);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {templates.map((tpl) => (
          <li key={tpl.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/plantillas/${tpl.id}`} className="font-semibold hover:underline">
                  {tpl.name}
                </Link>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{t(`channel.${tpl.channel}`)}</span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{t(`audience.${tpl.audience}`)}</span>
                {tpl.isProvisional ? <ProvisionalBadge /> : null}
                {tpl.isActive ? null : <InactiveBadge />}
              </div>
              {tpl.description ? <p className="mt-0.5 text-sm text-muted-foreground">{tpl.description}</p> : null}
              <p className="mt-1 line-clamp-2 text-sm">{tpl.body}</p>
            </div>
            <Link href={`/admin/plantillas/${tpl.id}`} className="text-sm font-medium text-forest hover:underline">
              {user.role === "admin" ? t("edit") : t("view")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
