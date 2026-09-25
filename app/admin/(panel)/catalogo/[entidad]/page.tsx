import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { InactiveBadge, ProvisionalBadge } from "@/components/admin/provisional-badge";
import { CodePlaceholder } from "@/components/catalog/code-placeholder";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth";
import { listEntityRows, listRefOptions, type RefOption } from "@/lib/catalog/admin";
import { entityBySlug, type EntityKey, type FieldDef } from "@/lib/catalog/entities";
import { moveAction, setActiveAction } from "../actions";

export async function generateMetadata(props: PageProps<"/admin/catalogo/[entidad]">): Promise<Metadata> {
  const def = entityBySlug((await props.params).entidad);
  const t = await getTranslations("admin.catalog");
  return { title: def ? t(`entities.${def.key}.title`) : t("title") };
}

export default async function EntityListPage(props: PageProps<"/admin/catalogo/[entidad]">) {
  const { entidad } = await props.params;
  const def = entityBySlug(entidad);
  if (!def) notFound();
  const user = await requireStaff(undefined, `/admin/catalogo/${entidad}`);
  const canEdit = user.role === "admin";
  const t = await getTranslations("admin.catalog");
  const te = await getTranslations("enums");
  const rows = await listEntityRows(user, def);

  const columns = def.listColumns
    .map((name) => def.fields.find((f) => f.name === name))
    .filter((f): f is FieldDef => Boolean(f));
  const refKeys = [...new Set(columns.flatMap((f) => (f.type === "ref" || f.type === "ref-multi" ? [f.ref] : [])))];
  const refMaps = new Map<EntityKey, Map<string, RefOption>>();
  for (const key of refKeys) {
    refMaps.set(key, new Map((await listRefOptions(user, key)).map((o) => [o.id, o])));
  }

  function formatCell(field: FieldDef, value: unknown): string {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return t("none");
    switch (field.type) {
      case "boolean":
        return value ? "✓" : t("none");
      case "ref":
        return refMaps.get(field.ref)?.get(String(value))?.name ?? t("none");
      case "ref-multi":
        return (value as string[]).map((id) => refMaps.get(field.ref)?.get(id)?.name ?? id).join(", ");
      case "enum":
      case "enum-multi": {
        const values = Array.isArray(value) ? (value as string[]) : [String(value)];
        return values
          .map((v) => (field.enumType === "segment" ? te(`segment.${v}` as "segment.food") : field.enumType === "size_family" ? te(`sizeFamily.${v}` as "sizeFamily.box") : te(`condition.${v}` as "condition.hot")))
          .join(", ");
      }
      default:
        return Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  const placeholderVariant = def.key === "product_types" ? undefined : "sample";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/catalogo" className="text-sm text-muted-foreground hover:text-foreground">
            {t("actions.backToCatalog")}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t(`entities.${def.key}.title`)}</h1>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href={`/admin/catalogo/${def.slug}/nuevo`}>
              <PlusIcon className="size-4" />
              {t("actions.new")}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit ? <TableHead className="w-20">{t("columns.order")}</TableHead> : null}
              <TableHead className="w-16">{t("columns.photo")}</TableHead>
              <TableHead>{t("fields.code")}</TableHead>
              <TableHead>{t("fields.name")}</TableHead>
              {columns.map((f) => (
                <TableHead key={f.name}>{t(`fields.${f.name}` as "fields.code")}</TableHead>
              ))}
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead className="text-right">{t("columns.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + columns.length} className="py-8 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row, index) => (
              <TableRow key={row.id} className={row.is_active ? undefined : "opacity-60"}>
                {canEdit ? (
                  <TableCell>
                    <div className="flex gap-1">
                      <form action={moveAction.bind(null, def.key, row.id, -1)}>
                        <Button type="submit" size="icon-xs" variant="ghost" disabled={index === 0} aria-label={t("actions.moveUp")}>
                          <ArrowUpIcon />
                        </Button>
                      </form>
                      <form action={moveAction.bind(null, def.key, row.id, 1)}>
                        <Button type="submit" size="icon-xs" variant="ghost" disabled={index === rows.length - 1} aria-label={t("actions.moveDown")}>
                          <ArrowDownIcon />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="size-10 overflow-hidden rounded border border-border">
                    {row.photo_url ? (
                      <Image src={row.photo_url} alt="" width={40} height={40} unoptimized className="size-10 object-cover" />
                    ) : (
                      <CodePlaceholder code={row.code} showCode={false} variant={placeholderVariant ?? ((row.size_family as "box" | "bag" | "food_box" | undefined) ?? "box")} />
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{row.name}</span>
                    {row.is_provisional ? <ProvisionalBadge /> : null}
                    {row.is_active ? null : <InactiveBadge />}
                  </div>
                </TableCell>
                {columns.map((f) => (
                  <TableCell key={f.name} className="max-w-56 truncate text-sm text-muted-foreground">
                    {formatCell(f, row[f.name])}
                  </TableCell>
                ))}
                <TableCell>
                  {canEdit ? (
                    <form action={setActiveAction.bind(null, def.key, row.id, !row.is_active)}>
                      <Button type="submit" size="xs" variant="outline">
                        {row.is_active ? t("actions.deactivate") : t("actions.activate")}
                      </Button>
                    </form>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/catalogo/${def.slug}/${row.id}`}>{canEdit ? t("actions.edit") : t("actions.view")}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
