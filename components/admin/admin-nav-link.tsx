"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNavLink({ href, children, badge }: { href: string; children: React.ReactNode; badge?: number }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-sidebar-accent",
      )}
    >
      {children}
      {badge ? (
        <span className="ml-2 rounded-full bg-signal-red px-1.5 py-0.5 text-xs font-semibold text-white" data-testid="nav-badge">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
