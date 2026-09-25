import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog/product-card";
import { ProductImage } from "@/components/catalog/product-image";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { CropFrame } from "@/components/site/crop-frame";
import { JsonLd } from "@/components/site/json-ld";
import { Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";
import { brand } from "@/config/brand";
import { getPublicCatalog, publicSetting } from "@/lib/catalog/public";
import { findType, formatCm, materialsForType, quoteHref, sizesForType, visibleTypes } from "@/lib/catalog/view";
import { log } from "@/lib/log";
import { absoluteUrl } from "@/lib/urls";

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const catalog = await getPublicCatalog();
    return visibleTypes(catalog).map((ty) => ({ categoria: ty.category.slug, tipo: ty.slug }));
  } catch (error) {
    log.warn("sin base de datos en el build: las fichas se generan bajo demanda", { error });
    return [];
  }
}

export async function generateMetadata(props: PageProps<"/catalogo/[categoria]/[tipo]">): Promise<Metadata> {
  const { categoria, tipo } = await props.params;
  const type = findType(await getPublicCatalog(), categoria, tipo);
  if (!type) return {};
  const canonical = `/catalogo/${type.category.slug}/${type.slug}`;
  return {
    title: type.name,
    description: type.description ?? undefined,
    alternates: { canonical },
    openGraph: { title: type.name, description: type.description ?? undefined, url: canonical, images: type.photoUrl ? [absoluteUrl(type.photoUrl)] : undefined },
  };
}

function SpecRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-border py-5 md:grid-cols-[14rem_1fr]">
      <dt className="font-semibold">{term}</dt>
      <dd className="text-ink/90">{children}</dd>
    </div>
  );
}

export default async function ProductPage(props: PageProps<"/catalogo/[categoria]/[tipo]">) {
  const { categoria, tipo } = await props.params;
  const t = await getTranslations();
  const catalog = await getPublicCatalog();
  const type = findType(catalog, categoria, tipo);
  if (!type) notFound();

  const { papers, calibers, reasons } = materialsForType(catalog, type);
  const sizes = sizesForType(catalog, type);
  const isFood = type.segments.includes("food");
  const related = visibleTypes(catalog).filter((ty) => ty.categoryId === type.categoryId && ty.id !== type.id).slice(0, 3);
  const deposit = publicSetting(catalog, "deposit_pct", 50);
  const standardDays = publicSetting(catalog, "lead_time_days_standard", 45);
  const smallDays = publicSetting(catalog, "lead_time_days_small", 30);

  return (
    <>
      <Section className="pt-10 sm:pt-14">
        <Breadcrumbs
          items={[
            { label: t("catalog.title"), href: "/catalogo" },
            { label: type.category.name, href: `/catalogo/${type.category.slug}` },
            { label: type.name, href: `/catalogo/${type.category.slug}/${type.slug}` },
          ]}
        />
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <CropFrame>
              <ProductImage
                photoUrl={type.photoUrl}
                code={type.code}
                alt={t("product.photoAlt", { name: type.name })}
                placeholderLabel={t("product.placeholder", { name: type.name })}
                variant={type.sizeFamily}
                sizes="(min-width: 1024px) 50vw, 100vw"
                priority
              />
            </CropFrame>
            {type.photos.length > 0 ? (
              <ul aria-label={t("product.morePhotos")} className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {type.photos.map((url, i) => (
                  <li key={url} className="relative aspect-square overflow-hidden rounded-sm bg-kraft-light">
                    <Image src={url} alt={`${t("product.photoAlt", { name: type.name })} ${i + 2}`} fill sizes="20vw" className="object-cover" />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-kraft-dark">{type.code}</p>
            <h1 className="mt-1 text-4xl leading-[1.02] font-extrabold tracking-[-0.03em] sm:text-5xl">{type.name}</h1>
            {type.description ? <p className="mt-4 text-lg text-ink/85">{type.description}</p> : null}
            <p className="mt-4 text-sm">
              <span className="font-semibold">{t("product.segments")}</span>{" "}
              {type.segments.map((s) => t(`enums.segment.${s}`)).join(" / ")}
            </p>
            <div className="mt-6 rounded-md bg-kraft-light p-5">
              <h2 className="font-bold">{t("product.conditionsTitle")}</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>{t("product.noMinimum")}</li>
                <li>{t("product.leadTime", { standard: standardDays, small: smallDays })}</li>
                <li>{t("product.payment", { deposit, balance: 100 - deposit })}</li>
              </ul>
            </div>
            <QuoteActions
              className="mt-6"
              quoteHref={quoteHref(type)}
              quoteLabel={t("product.quote")}
              whatsappLabel={t("product.whatsapp")}
              whatsappText={t("product.whatsappText", { name: type.name, code: type.code })}
            />
          </div>
        </div>
      </Section>

      <Section className="py-14">
        <dl className="border-b border-border">
          {type.typicalUses.length > 0 ? (
            <SpecRow term={t("product.uses")}>
              <ul className="list-inside list-disc space-y-1">
                {type.typicalUses.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </SpecRow>
          ) : null}
          <SpecRow term={t("product.papers")}>
            <ul className="space-y-2">
              {papers.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.name}</span>
                  {p.description ? <span className="block text-sm text-muted-foreground">{p.description}</span> : null}
                </li>
              ))}
            </ul>
          </SpecRow>
          <SpecRow term={t("product.calibers")}>
            <ul className="space-y-1">
              {calibers.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.name}</span>
                  {c.simpleLabel ? <span className="text-muted-foreground">{`: ${c.simpleLabel}`}</span> : null}
                </li>
              ))}
            </ul>
          </SpecRow>
          {reasons.length > 0 ? (
            <SpecRow term={t("product.rules")}>
              <ul className="space-y-1">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </SpecRow>
          ) : null}
          <SpecRow term={t("product.sizes")}>
            <ul className="tabular grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {sizes.map((s) => (
                <li key={s.id}>
                  {t("product.sizeLabel", { name: s.name, l: formatCm(s.lengthCm), w: formatCm(s.widthCm), h: formatCm(s.heightCm) })}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">{t("product.sizesNote")}</p>
          </SpecRow>
          <SpecRow term={t("product.print")}>
            <p>{catalog.printOptions.map((p) => p.name).join(", ")}.</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("product.printNote")}</p>
          </SpecRow>
          {catalog.finishes.length > 0 ? (
            <SpecRow term={t("product.finishes")}>
              <p>{catalog.finishes.map((f) => f.name).join(", ")}.</p>
            </SpecRow>
          ) : null}
          {isFood ? (
            <SpecRow term={t("product.food")}>
              <p>{catalog.foodAttributes.map((f) => f.name).join(", ")}.</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("product.foodNote")}</p>
            </SpecRow>
          ) : null}
        </dl>
      </Section>

      {related.length > 0 ? (
        <Section className="pb-20">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">{t("product.related", { category: type.category.name })}</h2>
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((ty) => (
              <ProductCard key={ty.id} type={ty} category={ty.category} />
            ))}
          </div>
        </Section>
      ) : null}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: type.name,
          description: type.description ?? undefined,
          sku: type.code,
          category: type.category.name,
          brand: { "@type": "Brand", name: brand.name },
          image: type.photoUrl ? [absoluteUrl(type.photoUrl), ...type.photos.map(absoluteUrl)] : undefined,
          url: absoluteUrl(`/catalogo/${type.category.slug}/${type.slug}`),
        }}
      />
    </>
  );
}
