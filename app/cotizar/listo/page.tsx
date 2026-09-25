import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckCircle2Icon, FileTextIcon } from "lucide-react";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getPublicCatalog, publicSetting } from "@/lib/catalog/public";
import { CONFIRMATION_COOKIE, specPdfPath, trackingPath } from "@/lib/quote/links";
import { getRequestByToken } from "@/lib/quote/tracking";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("confirmation");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Confirmación con número y "qué sigue" (PRD §8 paso 9). El token llega en una
 * cookie httpOnly (no en la URL, que ven GA4 y el Pixel). Sin cookie, al cotizador.
 */
export default async function ConfirmationPage() {
  const token = (await cookies()).get(CONFIRMATION_COOKIE)?.value ?? "";
  const request = token ? await getRequestByToken(token) : null;
  if (!request) redirect("/cotizar");
  const t = await getTranslations("confirmation");
  const catalog = await getPublicCatalog();
  const deposit = publicSetting(catalog, "deposit_pct", 50);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <CheckCircle2Icon aria-hidden="true" className="size-12 text-signal-green" strokeWidth={1.6} />
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.03em]">{t("title")}</h1>

      <div className="mt-6 rounded-lg border-2 border-forest bg-forest/[0.04] p-5">
        <p className="text-sm font-semibold text-muted-foreground">{t("number")}</p>
        <p className="tabular mt-1 text-3xl font-extrabold tracking-tight" data-testid="request-number">
          {request.number}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t("numberHint")}</p>
      </div>

      <h2 className="mt-10 text-xl font-bold">{t("nextTitle")}</h2>
      <ol className="mt-4 space-y-4">
        {[t("next1"), t("next2"), t("next3", { deposit, balance: 100 - deposit })].map((text, i) => (
          <li key={text} className="flex gap-4">
            <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-kraft-light font-bold text-kraft-dark">{i + 1}</span>
            <p className="pt-1">{text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild size="lg" className="h-12">
          {/* Enlace normal (no navegación del lado del cliente): la analítica no ve el cambio de ruta con el token. */}
          <a href={trackingPath(token)}>{t("tracking")}</a>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12">
          <a href={specPdfPath(request.id, token)} target="_blank" rel="noopener">
            <FileTextIcon className="size-4" />
            {t("pdf")}
          </a>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-12">
          <a href={whatsappLink(t("whatsappText", { brand: brand.name, number: request.number }))} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-4" />
            {t("whatsapp")}
          </a>
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{t("trackingHint")}</p>
      <AnalyticsScripts />
    </div>
  );
}
