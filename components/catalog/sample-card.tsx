import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CropFrame } from "@/components/site/crop-frame";
import type { PublicGallerySample } from "@/lib/catalog/public";
import { ProductImage } from "./product-image";

export function sampleQuoteHref(code: string): string {
  return `/cotizar?muestra=${encodeURIComponent(code)}`;
}

/** Muestra de la maleta con su código visible y el botón "Quiero algo así". */
export async function SampleCard({ sample, typeName }: { sample: PublicGallerySample; typeName?: string | null }) {
  const t = await getTranslations("gallery");
  return (
    <figure className="flex flex-col">
      <CropFrame>
        <ProductImage
          photoUrl={sample.photoUrl}
          code={sample.code}
          alt={sample.name}
          placeholderLabel={`${t("photoPending")}: ${sample.name}`}
          variant="sample"
          sizes="(min-width: 1024px) 23vw, (min-width: 640px) 30vw, 45vw"
        />
      </CropFrame>
      <figcaption className="mt-2 flex flex-1 flex-col px-2.5">
        <p className="text-sm font-bold tracking-wide text-ink">{sample.code}</p>
        <p className="text-sm leading-snug">{sample.name}</p>
        {typeName ? <p className="mt-0.5 text-xs text-muted-foreground">{typeName}</p> : null}
        <p className="mt-2">
          <Link
            href={sampleQuoteHref(sample.code)}
            aria-label={t("wantThisLabel", { code: sample.code })}
            className="link-accent text-sm"
          >
            {t("wantThis")}
          </Link>
        </p>
      </figcaption>
    </figure>
  );
}
