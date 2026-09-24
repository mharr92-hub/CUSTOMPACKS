"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { catalogNav, mainNav, QUOTE_HREF } from "@/config/navigation";

export function MobileNav() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("openMenu")}>
          <MenuIcon className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto bg-paper p-6">
        <SheetTitle className="sr-only">{t("mainLabel")}</SheetTitle>
        <nav aria-label={t("mainLabel")} className="mt-8 flex flex-col gap-6">
          <ul className="flex flex-col gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={close} className="block rounded-md px-2 py-2.5 text-base font-medium hover:bg-accent">
                  {t(item.key)}
                </Link>
                {item.key === "catalog" ? (
                  <ul className="ml-3 border-l border-border pl-3">
                    {catalogNav.map((sub) => (
                      <li key={sub.href}>
                        <Link href={sub.href} onClick={close} className="block rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-ink">
                          {t(sub.key)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="w-full">
            <Link href={QUOTE_HREF} onClick={close}>
              {t("ctaQuote")}
            </Link>
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
