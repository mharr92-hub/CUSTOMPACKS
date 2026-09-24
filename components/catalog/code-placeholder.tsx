import { cn } from "@/lib/utils";

/**
 * Marcador neutro mientras no llegan las fotos reales (TAREAS E2): una
 * silueta de caja o bolsa en tonos kraft con el código de la pieza. Nunca se
 * usan fotos de terceros.
 */
export function CodePlaceholder({
  code,
  variant = "box",
  className,
  label,
}: {
  code: string;
  variant?: "box" | "bag" | "food_box" | "sample";
  className?: string;
  /** Texto accesible; si falta, la imagen es decorativa. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 400 300"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("h-full w-full bg-kraft-light", className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={`grain-${code}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="#b98b57" opacity="0.25" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill="#ebdcc6" />
      <rect width="400" height="300" fill={`url(#grain-${code})`} />
      {variant === "bag" ? (
        <g fill="none" stroke="#8a6a45" strokeWidth="4" strokeLinejoin="round">
          <path d="M140 110 H260 L272 250 H128 Z" fill="#d9c09c" />
          <path d="M170 110 C170 70, 230 70, 230 110" />
        </g>
      ) : variant === "food_box" ? (
        <g fill="#d9c09c" stroke="#8a6a45" strokeWidth="4" strokeLinejoin="round">
          <path d="M120 150 L200 115 L280 150 L280 225 L200 255 L120 225 Z" />
          <path d="M120 150 L200 185 L280 150 M200 185 V255" fill="none" />
        </g>
      ) : (
        <g fill="#d9c09c" stroke="#8a6a45" strokeWidth="4" strokeLinejoin="round">
          <path d="M130 125 L200 95 L270 125 L270 225 L200 255 L130 225 Z" />
          <path d="M130 125 L200 155 L270 125 M200 155 V255" fill="none" />
        </g>
      )}
      <text x="200" y="285" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="20" fontWeight="600" fill="#5b4630">
        {code}
      </text>
    </svg>
  );
}
