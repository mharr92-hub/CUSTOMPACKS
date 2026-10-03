import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/site/legal-page";
import { brand } from "@/config/brand";
import { retentionPeriods } from "@/lib/artwork/retention";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/legal/privacidad" } };
}

export default async function PrivacyPage() {
  const { artworkMonths, evidenceMonths, legalYears } = await retentionPeriods();
  return (
    <LegalPage
      doc="privacy"
      sections={["who", "what", "why", "share", "retention", "rights", "consent", "security"]}
      values={{ brand: brand.name, email: brand.contactEmail, months: artworkMonths, evidenceMonths, years: legalYears }}
    />
  );
}
