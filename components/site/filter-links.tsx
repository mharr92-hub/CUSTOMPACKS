import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; href: string; active: boolean };

/** Grupo de filtros como enlaces (funcionan sin JavaScript y son indexables). */
export function FilterLinks({ label, options }: { label: string; options: FilterOption[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-semibold">{label}</span>
      {options.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.active ? "true" : undefined}
          scroll={false}
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
            o.active ? "border-forest bg-forest text-paper" : "border-border bg-paper hover:border-forest/60",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** Arma una URL con parámetros de búsqueda, omitiendo los vacíos. */
export function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
