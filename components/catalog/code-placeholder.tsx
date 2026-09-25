import { cn } from "@/lib/utils";

/**
 * Marcador neutro mientras no llegan las fotos reales (TAREAS E2): silueta de
 * la pieza en tonos kraft (SVG estático y cacheable en /public/placeholders)
 * con el código de la pieza encima. Nunca se usan fotos de terceros.
 */
export function CodePlaceholder({
  code,
  variant = "box",
  className,
  label,
  showCode = true,
}: {
  code: string;
  variant?: "box" | "bag" | "food_box" | "sample";
  className?: string;
  /** Texto accesible; si falta, el marcador es decorativo. */
  label?: string;
  showCode?: boolean;
}) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative h-full w-full bg-kraft-light bg-cover bg-center", className)}
      style={{ backgroundImage: `url(/placeholders/${variant}.svg)` }}
    >
      {showCode ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-[5%] text-center text-sm font-bold tracking-wide text-[#5b4630] md:text-base">
          {code}
        </span>
      ) : null}
    </div>
  );
}
