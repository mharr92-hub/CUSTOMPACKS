import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/site/brand-logo";
import { safeNextPath } from "@/lib/urls";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.login");
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage(props: PageProps<"/admin/ingresar">) {
  const t = await getTranslations("admin.login");
  const params = await props.searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null, "/admin");
  const linkError = params.error === "link";
  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <BrandLogo />
        <h1 className="mt-6 text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
        {linkError ? (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("linkError")}
          </p>
        ) : null}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
