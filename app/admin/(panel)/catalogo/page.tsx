import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { getCatalogStats } from "@/lib/catalog/admin";
import { ENTITIES, ENTITY_ORDER } from "@/lib/catalog/entities";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.catalog");
  return { title: t("title") };
}

export default async function CatalogAdminPage() {
  const user = await requireStaff(undefined, "/admin/catalogo");
  const t = await getTranslations("admin.catalog");
  const tc = await getTranslations("admin.compat");
  const stats = await getCatalogStats(user);
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENTITY_ORDER.map((key) => {
          const s = stats[key];
          return (
            <li key={key}>
              <Link
                href={`/admin/catalogo/${ENTITIES[key].slug}`}
                className="block h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <h2 className="font-medium">{t(`entities.${key}.title`)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("entityCount", { count: s.total })}
                  {" · "}
                  <span className={s.provisional > 0 ? "text-signal-yellow" : undefined}>{t("provisionalCount", { count: s.provisional })}</span>
                </p>
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/admin/catalogo/compatibilidades"
            className="block h-full rounded-lg border border-dashed border-primary/40 bg-card p-4 transition-colors hover:border-primary"
          >
            <h2 className="font-medium">{tc("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("compatIntro")}</p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
