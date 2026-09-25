import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";

const REASONS = ["factory", "finance", "qa", "direct"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/nosotros" } };
}

export default async function AboutPage() {
  const t = await getTranslations("about");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-12">
        <div className="grid gap-8 border-t-2 border-ink pt-10 lg:grid-cols-[1fr_1.3fr]">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{t("sloganTitle")}</h2>
          <p className="text-xl leading-relaxed">{t("sloganBody")}</p>
        </div>
      </Section>
      <Section className="pb-12">
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {REASONS.map((key) => (
            <div key={key} className="border-t-2 border-dashed border-forest/35 py-6">
              <dt className="text-lg font-bold">{t(`reasons.${key}Title`)}</dt>
              <dd className="mt-1 text-muted-foreground">{t(`reasons.${key}Body`)}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section className="pb-20">
        <div className="rounded-md bg-kraft-surface p-6 sm:p-10">
          <QuoteActions quoteLabel={t("cta")} />
        </div>
      </Section>
    </>
  );
}
