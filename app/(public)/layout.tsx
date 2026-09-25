import { getTranslations } from "next-intl/server";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { JsonLd } from "@/components/site/json-ld";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { brand } from "@/config/brand";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("common");
  const ts = await getTranslations("seo");
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-paper"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppFab />
      <AnalyticsScripts />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: brand.name,
          slogan: brand.slogan,
          url: brand.siteUrl,
          logo: `${brand.siteUrl}/icon.svg`,
          email: brand.contactEmail,
          description: ts("organizationDescription"),
          areaServed: "PA",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "sales",
            telephone: `+${brand.whatsappNumber}`,
            availableLanguage: "es",
          },
        }}
      />
    </>
  );
}
