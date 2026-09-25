import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/site/brand-logo";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quoteSoon");
  return { title: t("title") };
}

/** Punto de entrada del cotizador. El wizard completo se construye en E3. */
export default async function QuotePage() {
  const t = await getTranslations("quoteSoon");
  return (
    <main id="contenido" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <BrandLogo />
      <h1 className="mt-8 text-4xl font-extrabold tracking-[-0.03em]">{t("title")}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t("body")}</p>
      <Button asChild size="lg" className="mt-8 w-fit">
        <a href={whatsappLink(t("whatsappText"))} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="size-4" />
          {t("cta")}
        </a>
      </Button>
    </main>
  );
}
