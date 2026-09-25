import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { JsonLd } from "./json-ld";

export type Crumb = { label: string; href: string };

/** Migas de pan con su BreadcrumbList en JSON-LD. El último elemento es la página actual. */
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations("catalog");
  return (
    <>
      <nav aria-label={t("breadcrumb")} className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {last ? (
                  <span aria-current="page" className="text-ink">
                    {item.label}
                  </span>
                ) : (
                  <>
                    <Link href={item.href} className="hover:text-ink hover:underline hover:underline-offset-4">
                      {item.label}
                    </Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((item, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: item.label,
            item: `${brand.siteUrl}${item.href}`,
          })),
        }}
      />
    </>
  );
}
