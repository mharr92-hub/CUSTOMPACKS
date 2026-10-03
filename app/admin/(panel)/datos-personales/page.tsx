import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { searchPersonalData } from "@/lib/panel/personal-data";
import { AnonymizeForm } from "./anonymize-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.personalData");
  return { title: t("title") };
}

/**
 * Derechos del titular (Ley 81 de 2019; PRD §15): buscar por correo o
 * WhatsApp, exportar lo que tenemos y anonimizar. Solo admin.
 */
export default async function PersonalDataPage(props: PageProps<"/admin/datos-personales">) {
  const user = await requireStaff(["admin"], "/admin/datos-personales");
  const t = await getTranslations("admin.personalData");
  const ta = await getTranslations("admin");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const matches = q ? await searchPersonalData(user, q) : null;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
      <form className="mt-4 flex flex-wrap gap-2" action="/admin/datos-personales">
        <label htmlFor="pd-q" className="sr-only">
          {t("search")}
        </label>
        <Input id="pd-q" name="q" defaultValue={q} placeholder={t("placeholder")} className="max-w-sm" />
        <Button type="submit">{t("search")}</Button>
      </form>
      {matches ? (
        matches.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">{t("none")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/datos-personales?q=${encodeURIComponent(q)}`} data-testid="personal-export">
                {t("export")}
              </a>
            </Button>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-testid="personal-matches">
              {matches.map((m) => (
                <li key={m.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Link href={`/admin/solicitudes/${m.id}`} className="font-medium text-forest hover:underline">
                        {m.number}
                      </Link>
                      <span className="ml-2 text-muted-foreground">
                        {m.contactName}
                        {m.companyName ? ` · ${m.companyName}` : ""} · {ta(`statuses.${m.status}` as "statuses.submitted")} · {formatDate(m.submittedAt)}
                      </span>
                    </div>
                    {m.contactName !== "Anonimizado" ? <AnonymizeForm requestId={m.id} number={m.number} /> : <span className="text-xs text-muted-foreground">{t("anonymized")}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
