import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { brand } from "@/config/brand";
import { QUOTE_HREF } from "@/config/navigation";
import { whatsappLink } from "@/lib/whatsapp";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tw = await getTranslations("whatsapp");
  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-20 sm:px-6 lg:px-8">
      <h1 className="max-w-3xl text-4xl font-bold sm:text-6xl">{brand.slogan}</h1>
      <p className="max-w-2xl text-lg text-muted-foreground">{t("heroSupport")}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href={QUOTE_HREF}>{t("ctaQuote")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href={whatsappLink(tw("defaultMessage", { brand: brand.name }))} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-4" />
            {t("ctaWhatsapp")}
          </a>
        </Button>
      </div>
    </section>
  );
}
