import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/site/legal-page";
import { getPublicCatalog, publicSetting } from "@/lib/catalog/public";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/legal/terminos" } };
}

export default async function TermsPage() {
  const catalog = await getPublicCatalog();
  const deposit = publicSetting(catalog, "deposit_pct", 50);
  return (
    <LegalPage
      doc="terms"
      sections={["quotes", "payment", "leadTime", "artwork", "changes", "tolerances", "quality", "noMinimum"]}
      values={{ validity: publicSetting(catalog, "quote_validity_days", 15), deposit, balance: 100 - deposit }}
    />
  );
}
