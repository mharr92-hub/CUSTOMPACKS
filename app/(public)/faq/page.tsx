import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FaqList, faqJsonLd } from "@/components/site/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { PageHeader, Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/faq" } };
}

export default async function FaqPage() {
  const t = await getTranslations("faq");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-12">
        <div className="max-w-3xl">
          <FaqList />
        </div>
      </Section>
      <Section className="pb-20">
        <QuoteActions />
      </Section>
      <JsonLd data={await faqJsonLd()} />
    </>
  );
}
