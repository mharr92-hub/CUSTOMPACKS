import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Logo de texto provisional (docs/DECISIONES.md): marca en Inter con un
 * pliegue kraft que evoca una solapa de caja. Reemplazable por un SVG real.
 */
export async function BrandLogo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const t = await getTranslations("nav");
  return (
    <Link
      href="/"
      aria-label={t("homeLinkLabel", { brand: brand.name })}
      className={cn("group inline-flex items-center gap-2 font-semibold tracking-tight", className)}
    >
      <svg aria-hidden="true" viewBox="0 0 28 28" className="size-7 shrink-0">
        <rect x="1" y="7" width="26" height="20" rx="2" className={inverted ? "fill-paper" : "fill-forest"} />
        <path d="M1 9 L7 1 H21 L27 9 Z" className="fill-kraft" />
        <path d="M11 14 h6" strokeWidth="2" strokeLinecap="round" className={inverted ? "stroke-forest" : "stroke-paper"} />
      </svg>
      <span className={cn("text-lg leading-none", inverted ? "text-paper" : "text-ink")}>{brand.name}</span>
    </Link>
  );
}
