import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminNav } from "@/config/admin-nav";
import { brand } from "@/config/brand";
import type { CurrentUser } from "@/lib/auth";
import { signOutAction } from "@/app/admin/actions";
import { AdminNavLink } from "./admin-nav-link";

export async function AdminShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const t = await getTranslations("admin");
  const items = adminNav.filter((item) => item.roles.includes(user.role));
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40 lg:flex-row">
      <aside className="border-b border-border bg-sidebar lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            {brand.name}
            <span className="block text-xs font-normal text-muted-foreground">{t("title")}</span>
          </Link>
        </div>
        <nav aria-label={t("nav.label")} className="overflow-x-auto px-2 pb-3 lg:overflow-visible">
          <ul className="flex gap-1 lg:flex-col">
            {items.map((item) => (
              <li key={item.key}>
                <AdminNavLink href={item.href}>{t(`nav.${item.key}`)}</AdminNavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-background px-4 py-2 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            {t("nav.viewSite")}
          </Link>
          <span className="hidden text-muted-foreground sm:inline">
            {user.email}
            {" · "}
            {t(`roles.${user.role}`)}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOutIcon className="size-4" />
              {t("nav.signOut")}
            </Button>
          </form>
        </header>
        <main id="contenido" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
