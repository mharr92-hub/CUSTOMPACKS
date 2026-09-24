import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InactiveBadge, ProvisionalBadge } from "@/components/admin/provisional-badge";
import { requireStaff } from "@/lib/auth";
import { getEntityRow } from "@/lib/catalog/admin";
import { entityBySlug } from "@/lib/catalog/entities";
import { EntityForm } from "../entity-form";
import { loadRefOptions } from "../load-refs";
import { PhotoManager } from "../photo-manager";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(props: PageProps<"/admin/catalogo/[entidad]/[id]">): Promise<Metadata> {
  const def = entityBySlug((await props.params).entidad);
  const t = await getTranslations("admin.catalog");
  return { title: def ? t("editTitle", { entity: t(`entities.${def.key}.singular`) }) : t("title") };
}

export default async function EditEntityPage(props: PageProps<"/admin/catalogo/[entidad]/[id]">) {
  const { entidad, id } = await props.params;
  const def = entityBySlug(entidad);
  if (!def || !UUID.test(id)) notFound();
  const user = await requireStaff(undefined, `/admin/catalogo/${entidad}/${id}`);
  const canEdit = user.role === "admin";
  const row = await getEntityRow(user, def, id);
  if (!row) notFound();
  const t = await getTranslations("admin");
  const refOptions = await loadRefOptions(user, def);
  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/admin/catalogo/${def.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        {t("catalog.actions.backToList")}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">
          <span className="font-mono text-base text-muted-foreground">{row.code}</span> {row.name}
        </h1>
        {row.is_provisional ? <ProvisionalBadge /> : null}
        {row.is_active ? null : <InactiveBadge />}
      </div>
      {canEdit ? null : <p className="mt-2 text-sm text-muted-foreground">{t("readOnly")}</p>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <EntityForm entityKey={def.key} id={row.id} initial={row} refOptions={refOptions} canEdit={canEdit} />
        </div>
        {canEdit ? (
          <aside className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <PhotoManager
              entityKey={def.key}
              id={row.id}
              photoUrl={row.photo_url}
              photos={Array.isArray(row.photos) ? (row.photos as string[]) : []}
              hasGallery={def.hasGallery}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
