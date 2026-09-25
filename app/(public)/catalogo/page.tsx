import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog/product-card";
import { FilterLinks, withParams } from "@/components/site/filter-links";
import { PageHeader, Section } from "@/components/site/page-header";
import { getPublicCatalog } from "@/lib/catalog/public";
import { SEGMENT_SLUGS, segmentFromSlug, visibleTypes, type SegmentSlug } from "@/lib/catalog/view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalog");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/catalogo" } };
}

export default async function CatalogPage(props: PageProps<"/catalogo">) {
  const t = await getTranslations("catalog");
  const params = await props.searchParams;
  const catalog = await getPublicCatalog();
  const categorySlug = typeof params.categoria === "string" ? params.categoria : null;
  const segmentSlug = typeof params.segmento === "string" && params.segmento in SEGMENT_SLUGS ? (params.segmento as SegmentSlug) : null;
  const segment = segmentFromSlug(segmentSlug ?? undefined);
  const category = catalog.categories.find((c) => c.slug === categorySlug) ?? null;

  const types = visibleTypes(catalog).filter(
    (ty) => (!category || ty.categoryId === category.id) && (!segment || ty.segments.includes(segment)),
  );

  const categoryOptions = [
    { label: t("all"), href: withParams("/catalogo", { segmento: segmentSlug }), active: !category },
    ...catalog.categories.map((c) => ({
      label: c.name,
      href: withParams("/catalogo", { categoria: c.slug, segmento: segmentSlug }),
      active: category?.id === c.id,
    })),
  ];
  const segmentOptions = [
    { label: t("all"), href: withParams("/catalogo", { categoria: category?.slug }), active: !segment },
    ...(Object.keys(SEGMENT_SLUGS) as SegmentSlug[]).map((slug) => ({
      label: t(`segments.${slug}`),
      href: withParams("/catalogo", { categoria: category?.slug, segmento: slug }),
      active: segmentSlug === slug,
    })),
  ];

  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-20">
        <nav aria-label={t("filtersLabel")} className="flex flex-col gap-3 border-y border-border py-4">
          <FilterLinks label={t("categoryLabel")} options={categoryOptions} />
          <FilterLinks label={t("segmentLabel")} options={segmentOptions} />
        </nav>
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: types.length })}
        </p>
        {types.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center">
            <p>{t("empty")}</p>
            <Link href="/catalogo" className="mt-3 inline-block font-semibold text-forest underline underline-offset-4">
              {t("clearFilters")}
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((ty, i) => (
              <ProductCard key={ty.id} type={ty} category={ty.category} headingLevel="h2" priority={i < 2} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
