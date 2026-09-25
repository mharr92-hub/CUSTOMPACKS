import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CropFrame } from "@/components/site/crop-frame";
import type { PublicCategory, PublicProductType } from "@/lib/catalog/public";
import { productHref, quoteHref } from "@/lib/catalog/view";
import { ProductImage } from "./product-image";

export async function ProductCard({
  type,
  category,
  headingLevel = "h3",
  priority = false,
}: {
  type: PublicProductType;
  category: PublicCategory;
  headingLevel?: "h2" | "h3";
  priority?: boolean;
}) {
  const t = await getTranslations();
  const Heading = headingLevel;
  const href = productHref(category, type);
  return (
    <article className="flex flex-col">
      <CropFrame>
        <ProductImage
          photoUrl={type.photoUrl}
          code={type.code}
          alt={t("product.photoAlt", { name: type.name })}
          placeholderLabel={t("product.placeholder", { name: type.name })}
          variant={type.sizeFamily}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
          priority={priority}
        />
      </CropFrame>
      <div className="mt-2 flex flex-1 flex-col px-2.5">
        <p className="card-code">{type.code}</p>
        <Heading className="mt-0.5 text-lg leading-snug font-semibold">
          <Link href={href} className="inline-block py-0.5 hover:underline hover:underline-offset-4">
            {type.name}
          </Link>
        </Heading>
        {type.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{type.description}</p> : null}
        <p className="mt-3">
          <Link href={quoteHref(type)} className="link-accent text-sm">
            {t("catalog.quote")}
          </Link>
        </p>
      </div>
    </article>
  );
}
