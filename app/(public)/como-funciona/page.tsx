import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";
import { StepsDetailed } from "@/components/site/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("howItWorks");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/como-funciona" } };
}

export default async function HowItWorksPage() {
  const t = await getTranslations("howItWorks");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-12">
        <StepsDetailed />
      </Section>
      <Section className="pb-20">
        <div className="rounded-md bg-kraft-surface p-6 sm:p-10">
          <QuoteActions quoteLabel={t("cta")} />
        </div>
      </Section>
    </>
  );
}
