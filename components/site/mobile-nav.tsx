import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MenuIcon, XIcon } from "lucide-react";
import { catalogNav, mainNav, QUOTE_HREF } from "@/config/navigation";
import { CloseOnNavigate } from "./close-on-navigate";

/**
 * Menú móvil sin librerías: <details> nativo (accesible con teclado y sin
 * JavaScript). Un componente mínimo lo cierra al navegar. Mantener el sitio
 * público casi sin JS es lo que sostiene el LCP móvil < 2,5 s.
 */
export async function MobileNav() {
  const t = await getTranslations("nav");
  return (
    <details id="menu-movil" className="group lg:hidden">
      <summary
        aria-label={t("openMenu")}
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-accent [&::-webkit-details-marker]:hidden"
      >
        <MenuIcon aria-hidden="true" className="size-5 group-open:hidden" />
        <XIcon aria-hidden="true" className="hidden size-5 group-open:block" />
      </summary>
      <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-paper px-4 pt-4 pb-10">
        <nav aria-label={t("mainLabel")}>
          <ul className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-md px-2 py-3 text-lg font-semibold hover:bg-accent">
                  {t(item.key)}
                </Link>
                {item.key === "catalog" ? (
                  <ul className="mb-2 ml-3 border-l-2 border-dashed border-forest/35 pl-3">
                    {catalogNav.map((sub) => (
                      <li key={sub.href}>
                        <Link href={sub.href} className="block rounded-md px-2 py-2 text-base text-muted-foreground hover:bg-accent hover:text-ink">
                          {t(sub.key)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href={QUOTE_HREF}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-forest text-base font-semibold text-paper hover:bg-forest-dark"
          >
            {t("ctaQuote")}
          </Link>
        </nav>
      </div>
      <CloseOnNavigate targetId="menu-movil" />
    </details>
  );
}
