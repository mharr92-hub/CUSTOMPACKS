import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { catalogNav, companyNav, legalNav, type NavItem } from "@/config/navigation";
import { BrandLogo } from "./brand-logo";

async function FooterColumn({ title, items }: { title: string; items: readonly NavItem[] }) {
  const t = await getTranslations("nav");
  return (
    <div>
      <h2 className="text-sm font-semibold text-paper">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-sm text-paper/75 hover:text-paper">
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-forest-dark text-paper">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <BrandLogo inverted />
          <p className="mt-4 max-w-sm text-sm text-paper/75">{t("tagline")}</p>
          <p className="mt-2 text-sm font-medium text-kraft-light">{brand.slogan}</p>
        </div>
        <FooterColumn title={t("explore")} items={catalogNav} />
        <FooterColumn title={t("company")} items={companyNav} />
        <div>
          <h2 className="text-sm font-semibold text-paper">{t("conditionsTitle")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-paper/75">
            <li>{t("payment")}</li>
            <li>{t("leadTime")}</li>
            <li>{t("noMinimum")}</li>
          </ul>
          <div className="mt-6">
            <FooterColumn title={t("legal")} items={legalNav} />
          </div>
        </div>
      </div>
      <div className="border-t border-paper/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-paper/60 sm:px-6 lg:px-8">
          {t("rights", { year, brand: brand.name })}
        </p>
      </div>
    </footer>
  );
}
