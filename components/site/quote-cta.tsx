import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { QUOTE_HREF } from "@/config/navigation";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "./whatsapp-fab";

/** Par de acciones principales: cotizar (primaria) y WhatsApp (secundaria). */
export async function QuoteActions({
  quoteHref = QUOTE_HREF,
  quoteLabel,
  whatsappText,
  whatsappLabel,
  inverted = false,
  className,
}: {
  quoteHref?: string;
  quoteLabel?: string;
  whatsappText?: string;
  whatsappLabel?: string;
  inverted?: boolean;
  className?: string;
}) {
  const t = await getTranslations("home");
  const tw = await getTranslations("whatsapp");
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Button asChild size="lg" className={cn("h-12 px-5 text-base", inverted && "bg-paper text-forest hover:bg-kraft-light")}>
        <Link href={quoteHref}>{quoteLabel ?? t("ctaQuote")}</Link>
      </Button>
      <Button
        asChild
        size="lg"
        variant="outline"
        className={cn("h-12 px-5 text-base", inverted ? "border-paper/60 bg-transparent text-paper hover:bg-paper/10 hover:text-paper" : "border-ink/25 bg-transparent")}
      >
        <a href={whatsappLink(whatsappText ?? tw("defaultMessage", { brand: brand.name }))} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="size-4" />
          {whatsappLabel ?? t("ctaWhatsapp")}
        </a>
      </Button>
    </div>
  );
}
