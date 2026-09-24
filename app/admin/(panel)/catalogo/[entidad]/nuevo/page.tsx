import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { entityBySlug } from "@/lib/catalog/entities";
import { EntityForm } from "../entity-form";
import { loadRefOptions } from "../load-refs";

export async function generateMetadata(props: PageProps<"/admin/catalogo/[entidad]/nuevo">): Promise<Metadata> {
  const def = entityBySlug((await props.params).entidad);
  const t = await getTranslations("admin.catalog");
  return { title: def ? t("newTitle", { entity: t(`entities.${def.key}.singular`) }) : t("title") };
}

export default async function NewEntityPage(props: PageProps<"/admin/catalogo/[entidad]/nuevo">) {
  const { entidad } = await props.params;
  const def = entityBySlug(entidad);
  if (!def) notFound();
  const user = await requireStaff(["admin"], `/admin/catalogo/${entidad}/nuevo`);
  const t = await getTranslations("admin.catalog");
  const refOptions = await loadRefOptions(user, def);
  const initial: Record<string, unknown> = {
    is_active: true,
    is_provisional: false,
    affects_price: !["eco_attributes", "food_attributes", "gallery_samples"].includes(def.key),
    sort_order: 0,
  };
  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/admin/catalogo/${def.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        {t("actions.backToList")}
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{t("newTitle", { entity: t(`entities.${def.key}.singular`) })}</h1>
      <div className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6">
        <EntityForm entityKey={def.key} id={null} initial={initial} refOptions={refOptions} canEdit />
      </div>
    </div>
  );
}
