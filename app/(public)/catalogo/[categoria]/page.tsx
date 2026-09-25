import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductCard } from "@/components/catalog/product-card";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { PageHeader, Section } from "@/components/site/page-header";
import { getPublicCatalog } from "@/lib/catalog/public";
import { visibleTypes } from "@/lib/catalog/view";
import { log } from "@/lib/log";

export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const catalog = await getPublicCatalog();
    return catalog.categories.map((c) => ({ categoria: c.slug }));
  } catch (error) {
    log.warn("sin base de datos en el build: las categorías se generan bajo demanda", { error });
    return [];
  }
}

export async function generateMetadata(props: PageProps<"/catalogo/[categoria]">): Promise<Metadata> {
  const { categoria } = await props.params;
  const catalog = await getPublicCatalog();
  const category = catalog.categories.find((c) => c.slug === categoria);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? undefined,
    alternates: { canonical: `/catalogo/${category.slug}` },
  };
}

export default async function CategoryPage(props: PageProps<"/catalogo/[categoria]">) {
  const { categoria } = await props.params;
  const t = await getTranslations("catalog");
  const catalog = await getPublicCatalog();
  const category = catalog.categories.find((c) => c.slug === categoria);
  if (!category) notFound();
  const types = visibleTypes(catalog).filter((ty) => ty.categoryId === category.id);
  const others = catalog.categories.filter((c) => c.id !== category.id);

  return (
    <>
      <PageHeader title={category.name} intro={category.description ?? undefined}>
        <Breadcrumbs
          items={[
            { label: t("title"), href: "/catalogo" },
            { label: category.name, href: `/catalogo/${category.slug}` },
          ]}
        />
      </PageHeader>
      <Section className="pb-16">
        <p className="text-sm text-muted-foreground">{t("count", { count: types.length })}</p>
        <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((ty, i) => (
            <ProductCard key={ty.id} type={ty} category={category} headingLevel="h2" priority={i < 2} />
          ))}
        </div>
      </Section>
      {others.length > 0 ? (
        <Section className="pb-20">
          <h2 className="text-xl font-bold">{t("otherCategories")}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c.id}>
                <Link href={`/catalogo/${c.slug}`} className="inline-block rounded-full border border-border px-3.5 py-1.5 text-sm hover:border-forest/60">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
