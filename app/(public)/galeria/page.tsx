import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SampleCard } from "@/components/catalog/sample-card";
import { FilterLinks, withParams } from "@/components/site/filter-links";
import { PageHeader, Section } from "@/components/site/page-header";
import { Button } from "@/components/ui/button";
import { getPublicCatalog } from "@/lib/catalog/public";
import { SEGMENT_SLUGS, segmentFromSlug, type SegmentSlug } from "@/lib/catalog/view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("gallery");
  return { title: t("title"), description: t("metaDescription"), alternates: { canonical: "/galeria" } };
}

export default async function GalleryPage(props: PageProps<"/galeria">) {
  const t = await getTranslations("gallery");
  const tc = await getTranslations("catalog");
  const params = await props.searchParams;
  const catalog = await getPublicCatalog();
  const segmentSlug = typeof params.segmento === "string" && params.segmento in SEGMENT_SLUGS ? (params.segmento as SegmentSlug) : null;
  const segment = segmentFromSlug(segmentSlug ?? undefined);
  const typeCode = typeof params.tipo === "string" ? params.tipo : "";
  const type = catalog.productTypes.find((ty) => ty.code === typeCode) ?? null;
  const typeNames = new Map(catalog.productTypes.map((ty) => [ty.id, ty.name]));

  const samples = catalog.gallery.filter(
    (s) => (!segment || s.segments.includes(segment)) && (!type || s.productTypeId === type.id),
  );
  const typesWithSamples = catalog.productTypes.filter((ty) => catalog.gallery.some((s) => s.productTypeId === ty.id));

  const segmentOptions = [
    { label: t("all"), href: withParams("/galeria", { tipo: type?.code }), active: !segment },
    ...(Object.keys(SEGMENT_SLUGS) as SegmentSlug[]).map((slug) => ({
      label: tc(`segments.${slug}`),
      href: withParams("/galeria", { segmento: slug, tipo: type?.code }),
      active: segmentSlug === slug,
    })),
  ];

  return (
    <>
      <PageHeader title={t("title")} intro={t("intro")} />
      <Section className="pb-20">
        <div role="search" aria-label={t("filtersLabel")} className="flex flex-col gap-3 border-y border-border py-4 md:flex-row md:items-center md:justify-between">
          <FilterLinks label={t("segmentLabel")} options={segmentOptions} />
          <form method="get" action="/galeria" className="flex items-center gap-2">
            {segmentSlug ? <input type="hidden" name="segmento" value={segmentSlug} /> : null}
            <label htmlFor="tipo" className="text-sm font-semibold">
              {t("typeLabel")}
            </label>
            <select id="tipo" name="tipo" defaultValue={type?.code ?? ""} className="h-9 max-w-56 rounded-md border border-input bg-paper px-2.5 text-sm">
              <option value="">{t("all")}</option>
              {typesWithSamples.map((ty) => (
                <option key={ty.id} value={ty.code}>
                  {ty.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              {t("apply")}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: samples.length })}
        </p>
        {samples.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center">
            <p>{t("empty")}</p>
            <Link href="/galeria" className="mt-3 inline-block font-semibold text-forest underline underline-offset-4">
              {t("clearFilters")}
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {samples.map((s) => (
              <SampleCard key={s.id} sample={s} typeName={s.productTypeId ? typeNames.get(s.productTypeId) : null} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
