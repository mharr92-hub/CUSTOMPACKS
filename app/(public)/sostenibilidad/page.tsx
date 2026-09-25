import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";
import { getPublicCatalog } from "@/lib/catalog/public";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sustainability");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/sostenibilidad" } };
}

export default async function SustainabilityPage() {
  const t = await getTranslations("sustainability");
  const catalog = await getPublicCatalog();
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-12">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">{t("attributesTitle")}</h2>
        <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
          {catalog.ecoAttributes.map((a) => (
            <li key={a.id} className="border-t-2 border-dashed border-forest/35 py-5">
              <p className="text-lg font-bold">{a.name}</p>
              {a.description ? <p className="mt-1 text-muted-foreground">{a.description}</p> : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section className="pb-20">
        <div className="rounded-md bg-kraft-light p-6 sm:p-10">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">{t("commitmentTitle")}</h2>
          <p className="mt-3 max-w-2xl text-lg">{t("commitment")}</p>
          <QuoteActions className="mt-8" quoteLabel={t("cta")} />
        </div>
      </Section>
    </>
  );
}
