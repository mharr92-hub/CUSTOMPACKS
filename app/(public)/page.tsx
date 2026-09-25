import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BoxesIcon, ClipboardCheckIcon, FactoryIcon, HandCoinsIcon } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card";
import { SampleCard } from "@/components/catalog/sample-card";
import { Dieline } from "@/components/site/dieline";
import { FaqList } from "@/components/site/faq-list";
import { Section } from "@/components/site/page-header";
import { QuoteActions } from "@/components/site/quote-cta";
import { StepsCompact } from "@/components/site/steps";
import { brand } from "@/config/brand";
import { getPublicCatalog } from "@/lib/catalog/public";
import { productHref, visibleTypes } from "@/lib/catalog/view";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: { absolute: t("metaTitle", { brand: brand.name }) }, alternates: { canonical: "/" } };
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="link-accent inline-block">
      {children}
    </Link>
  );
}

export default async function HomePage() {
  const t = await getTranslations("home");
  const catalog = await getPublicCatalog();
  const types = visibleTypes(catalog);

  // Dos piezas por categoría activa, hasta 6, para mostrar el rango del catálogo.
  const featured = catalog.categories.flatMap((c) => types.filter((ty) => ty.categoryId === c.id).slice(0, 2)).slice(0, 6);
  const commerceExamples = types.filter((ty) => ty.segments.includes("commercial")).slice(0, 4);
  const foodExamples = types.filter((ty) => ty.segments.includes("food") && !ty.segments.includes("commercial")).slice(0, 4);
  const samples = catalog.gallery.slice(0, 4);
  const typeNames = new Map(catalog.productTypes.map((ty) => [ty.id, ty.name]));

  const proofs = [
    { icon: FactoryIcon, title: t("proofs.factoryTitle"), body: t("proofs.factoryBody") },
    { icon: ClipboardCheckIcon, title: t("proofs.qaTitle"), body: t("proofs.qaBody") },
    { icon: HandCoinsIcon, title: t("proofs.paymentTitle"), body: t("proofs.paymentBody") },
    { icon: BoxesIcon, title: t("proofs.volumeTitle"), body: t("proofs.volumeBody") },
  ];

  return (
    <>
      {/* 1. Hero */}
      <section aria-labelledby="hero-title" className="overflow-hidden bg-kraft-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 pt-10 pb-12 sm:px-6 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8 lg:pb-20">
          <div>
            <h1 id="hero-title" className="max-w-[12ch] text-[2.9rem] leading-[0.95] font-extrabold tracking-[-0.04em] text-ink sm:text-7xl lg:text-[5.4rem]">
              {brand.slogan}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink/85 sm:text-xl">{t("heroSupport")}</p>
            <QuoteActions className="mt-8" />
            <p className="mt-6 max-w-xl border-l-2 border-forest pl-4 text-sm text-ink/80">{t("heroQuoteNote")}</p>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <Dieline />
          </div>
        </div>
      </section>

      {/* 2. Franja de pruebas */}
      <section aria-labelledby="proofs-title" className="border-b border-border">
        <h2 id="proofs-title" className="sr-only">
          {t("proofs.title")}
        </h2>
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {proofs.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-paper px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
              <Icon aria-hidden="true" className="size-5 text-forest sm:size-6" strokeWidth={1.6} />
              <p className="mt-2 text-base font-bold sm:mt-3 sm:text-lg">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Dos puertas */}
      <Section labelledBy="doors-title" className="py-16 sm:py-20">
        <h2 id="doors-title" className="h-section">
          {t("doors.title")}
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            { key: "commerce", tone: "bg-kraft-light", examples: commerceExamples, href: "/catalogo?segmento=comercio" },
            { key: "food", tone: "bg-forest text-paper", examples: foodExamples, href: "/catalogo?segmento=alimentos" },
          ].map((door) => (
            <div key={door.key} className={`flex flex-col rounded-md p-6 sm:p-8 ${door.tone}`}>
              <h3 className="text-2xl font-bold sm:text-3xl">{t(`doors.${door.key as "commerce"}Title`)}</h3>
              <p className="mt-3 max-w-md opacity-90">{t(`doors.${door.key as "commerce"}Body`)}</p>
              <p className="mt-6 text-sm font-semibold opacity-80">{t("doors.examples")}</p>
              <ul className="mt-2 space-y-1.5">
                {door.examples.map((ty) => (
                  <li key={ty.id}>
                    <Link href={productHref(ty.category, ty)} className="underline decoration-1 underline-offset-4 hover:decoration-2">
                      {ty.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href={door.href}
                className={`mt-8 inline-flex w-fit items-center rounded-md px-4 py-2.5 text-sm font-semibold ${door.key === "food" ? "bg-paper text-forest hover:bg-kraft-light" : "bg-forest text-paper hover:bg-forest-dark"}`}
              >
                {t(`doors.${door.key as "commerce"}Cta`)}
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Catálogo destacado */}
      <Section labelledBy="featured-title" className="pb-16 sm:pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="featured-title" className="h-section">
              {t("featured.title")}
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">{t("featured.intro")}</p>
          </div>
          <MoreLink href="/catalogo">{t("featured.cta")}</MoreLink>
        </div>
        <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((ty) => (
            <ProductCard key={ty.id} type={ty} category={ty.category} />
          ))}
        </div>
      </Section>

      {/* 5. Cómo funciona */}
      <section aria-labelledby="steps-title" className="bg-muted py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 id="steps-title" className="h-section">
            {t("steps.title")}
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">{t("steps.intro")}</p>
          <StepsCompact className="mt-10" />
          <p className="mt-10">
            <MoreLink href="/como-funciona">{t("steps.cta")}</MoreLink>
          </p>
        </div>
      </section>

      {/* 6. Galería de la maleta */}
      <Section labelledBy="gallery-title" className="py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="gallery-title" className="h-section">
              {t("gallery.title")}
            </h2>
            <p className="mt-2 max-w-xl text-muted-foreground">{t("gallery.intro")}</p>
          </div>
          <MoreLink href="/galeria">{t("gallery.cta")}</MoreLink>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
          {samples.map((s) => (
            <SampleCard key={s.id} sample={s} typeName={s.productTypeId ? typeNames.get(s.productTypeId) : null} />
          ))}
        </div>
      </Section>

      {/* 7. Clientes */}
      <Section labelledBy="clients-title" className="pb-16 sm:pb-20">
        <div className="grid gap-6 border-t-2 border-ink pt-10 lg:grid-cols-[1fr_1.4fr]">
          <h2 id="clients-title" className="h-section">
            {t("clients.title")}
          </h2>
          <div>
            <p className="text-xl leading-relaxed sm:text-2xl">{t("clients.body")}</p>
            <p className="mt-6">
              <MoreLink href="/clientes">{t("clients.cta")}</MoreLink>
            </p>
          </div>
        </div>
      </Section>

      {/* 8. Sostenibilidad */}
      <section aria-labelledby="sustainability-title" className="bg-kraft-light py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 id="sustainability-title" className="h-section">
              {t("sustainability.title")}
            </h2>
            <p className="mt-4 max-w-xl text-lg">{t("sustainability.body")}</p>
            <p className="mt-6">
              <MoreLink href="/sostenibilidad">{t("sustainability.cta")}</MoreLink>
            </p>
          </div>
          <ul className="self-center">
            {catalog.ecoAttributes.map((a) => (
              <li key={a.id} className="border-b border-dashed border-kraft-dark/40 py-3 text-lg font-semibold last:border-0">
                {a.name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 9. Preguntas frecuentes */}
      <Section labelledBy="faq-title" className="py-16 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <div>
            <h2 id="faq-title" className="h-section">
              {t("faq.title")}
            </h2>
            <p className="mt-4">
              <MoreLink href="/faq">{t("faq.cta")}</MoreLink>
            </p>
          </div>
          <FaqList keys={["minimum", "leadTime", "whyNoPrice"]} />
        </div>
      </Section>

      {/* 10. Cierre */}
      <section aria-labelledby="closing-title" className="bg-kraft-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <h2 id="closing-title" className="max-w-[14ch] text-4xl leading-[0.98] font-extrabold tracking-[-0.035em] sm:text-6xl">
            {brand.slogan}
          </h2>
          <p className="mt-5 max-w-xl text-lg text-ink/85">{t("closing.body")}</p>
          <QuoteActions className="mt-8" quoteLabel={t("closing.cta")} />
        </div>
      </section>
    </>
  );
}
