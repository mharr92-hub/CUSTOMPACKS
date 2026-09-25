import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MailIcon } from "lucide-react";
import { PageHeader, Section } from "@/components/site/page-header";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { QUOTE_HREF } from "@/config/navigation";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/contacto" } };
}

function formatPhone(digits: string): string {
  // 507 6000 0000 → +507 6000-0000 (formato de Panamá); otros países quedan con +.
  if (digits.startsWith("507") && digits.length === 11) return `+507 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  return `+${digits}`;
}

export default async function ContactPage() {
  const t = await getTranslations("contact");
  const tw = await getTranslations("whatsapp");
  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md bg-forest p-6 text-paper sm:p-8">
            <WhatsAppIcon className="size-7" />
            <h2 className="mt-4 text-xl font-bold">{t("whatsappTitle")}</h2>
            <p className="tabular mt-1 text-lg">{formatPhone(brand.whatsappNumber)}</p>
            <Button asChild className="mt-6 bg-paper text-forest hover:bg-kraft-light">
              <a href={whatsappLink(tw("defaultMessage", { brand: brand.name }))} target="_blank" rel="noopener noreferrer">
                {t("whatsappCta")}
              </a>
            </Button>
          </div>
          <div className="rounded-md bg-kraft-light p-6 sm:p-8">
            <MailIcon aria-hidden="true" className="size-7 text-forest" />
            <h2 className="mt-4 text-xl font-bold">{t("emailTitle")}</h2>
            <p className="mt-1 text-lg break-all">
              <a href={`mailto:${brand.contactEmail}`} className="underline underline-offset-4">
                {brand.contactEmail}
              </a>
            </p>
          </div>
          <div className="rounded-md border border-border p-6 sm:p-8">
            <h2 className="text-xl font-bold">{t("quoteTitle")}</h2>
            <p className="mt-2 text-muted-foreground">{t("quoteBody")}</p>
            <Button asChild className="mt-6">
              <Link href={QUOTE_HREF}>{t("quoteCta")}</Link>
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
