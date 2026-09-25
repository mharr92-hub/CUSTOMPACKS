import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";

export const FAQ_KEYS = [
  "minimum",
  "leadTime",
  "payment",
  "whatToQuote",
  "whyNoPrice",
  "formats",
  "design",
  "samples",
  "food",
  "delivery",
] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];

/** Preguntas frecuentes con <details> nativo (sin JavaScript). */
export async function FaqList({ keys = FAQ_KEYS }: { keys?: readonly FaqKey[] }) {
  const t = await getTranslations("faq.items");
  return (
    <div className="divide-y divide-border border-y border-border">
      {keys.map((key) => (
        <details key={key} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-base font-semibold [&::-webkit-details-marker]:hidden">
            {t(`${key}.q`)}
            <PlusIcon aria-hidden="true" className="size-5 shrink-0 text-forest transition-transform group-open:rotate-45" />
          </summary>
          <p className="max-w-prose pb-5 text-muted-foreground">{t(`${key}.a`)}</p>
        </details>
      ))}
    </div>
  );
}

export async function faqJsonLd(keys: readonly FaqKey[] = FAQ_KEYS) {
  const t = await getTranslations("faq.items");
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: keys.map((key) => ({
      "@type": "Question",
      name: t(`${key}.q`),
      acceptedAnswer: { "@type": "Answer", text: t(`${key}.a`) },
    })),
  };
}
