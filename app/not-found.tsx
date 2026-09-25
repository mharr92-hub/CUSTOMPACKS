import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/site/brand-logo";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="contenido" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <BrandLogo />
      <h1 className="mt-8 text-4xl font-extrabold tracking-[-0.03em]">{t("title")}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t("body")}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/catalogo">{t("catalog")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
