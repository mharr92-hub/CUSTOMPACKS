import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";

const DEMANDS = ["spec", "proof", "qa", "docs"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/clientes" } };
}

/** Clientes: texto genérico, sin logos ni nombres hasta tener autorización escrita (decisión provisional). */
export default async function ClientsPage() {
  const t = await getTranslations("clients");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-12">
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {DEMANDS.map((key) => (
            <div key={key} className="border-t-2 border-ink py-6">
              <dt className="text-xl font-bold">{t(`demands.${key}Title`)}</dt>
              <dd className="mt-2 text-muted-foreground">{t(`demands.${key}Body`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">{t("logosNote")}</p>
      </Section>
      <Section className="pb-20">
        <div className="rounded-md bg-kraft-surface p-6 sm:p-10">
          <QuoteActions quoteLabel={t("cta")} />
        </div>
      </Section>
    </>
  );
}
