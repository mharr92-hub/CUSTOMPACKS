import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth";
import { listCompatRules, listRefOptions } from "@/lib/catalog/admin";
import { CompatMatrix } from "./compat-matrix";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.compat");
  return { title: t("title") };
}

export default async function CompatibilitiesPage(props: PageProps<"/admin/catalogo/compatibilidades">) {
  const user = await requireStaff(undefined, "/admin/catalogo/compatibilidades");
  const t = await getTranslations("admin");
  const params = await props.searchParams;
  const [types, papers, calibers] = await Promise.all([
    listRefOptions(user, "product_types"),
    listRefOptions(user, "papers"),
    listRefOptions(user, "calibers"),
  ]);
  const selectedCode = typeof params.tipo === "string" ? params.tipo : types[0]?.code;
  const selected = types.find((type) => type.code === selectedCode) ?? types[0];
  const rules = selected ? await listCompatRules(user, selected.id) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/catalogo" className="text-sm text-muted-foreground hover:text-foreground">
        {t("catalog.actions.backToCatalog")}
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{t("compat.title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("compat.intro")}</p>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="tipo" className="text-sm font-medium">
            {t("compat.selectType")}
          </label>
          <select
            id="tipo"
            name="tipo"
            defaultValue={selected?.code}
            className="block h-9 min-w-72 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            {types.map((type) => (
              <option key={type.id} value={type.code}>
                {type.code}
                {" · "}
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          {t("compat.show")}
        </Button>
      </form>

      {selected ? (
        <div className="mt-6">
          <CompatMatrix
            key={selected.id}
            typeId={selected.id}
            typeName={`${selected.code} · ${selected.name}`}
            papers={papers}
            calibers={calibers}
            rules={rules}
            canEdit={user.role === "admin"}
          />
        </div>
      ) : null}
    </div>
  );
}
