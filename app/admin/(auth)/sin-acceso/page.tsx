import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/admin/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.noAccess");
  return { title: t("title"), robots: { index: false } };
}

export default async function NoAccessPage() {
  const t = await getTranslations("admin.noAccess");
  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/">{t("back")}</Link>
          </Button>
          <form action={signOutAction}>
            <Button type="submit">{t("signOut")}</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
