import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Plano desplegado (troquel) de una caja plegadiza con tapa: línea continua =
 * corte, línea discontinua = pliegue, y cotas de largo, ancho y alto. Es el
 * elemento gráfico de la marca; el contorno se dibuja una vez al cargar.
 */
const OUTLINE =
  "M62 120 L68 84 L126 84 L132 120 L252 120 L258 84 L316 84 L322 120 L322 50 L326 36 Q328 32 334 32 L430 32 Q436 32 438 36 L442 50 L442 280 L322 280 L316 316 L258 316 L252 280 L252 350 L248 364 Q246 368 240 368 L144 368 Q138 368 136 364 L132 350 L132 280 L126 316 L68 316 L62 280 L40 268 L40 132 Z";

const FOLDS = [
  "M62 120 V280",
  "M132 120 V280",
  "M252 120 V280",
  "M322 120 V280",
  "M62 120 H132",
  "M252 120 H442",
  "M322 50 H442",
  "M62 280 H322",
  "M132 350 H252",
];

export async function Dieline({ className }: { className?: string }) {
  const t = await getTranslations("home.dieline");
  return (
    <svg viewBox="0 0 520 420" role="img" aria-label={t("label")} className={cn("h-auto w-full", className)}>
      {/* Leyenda */}
      <g className="dieline-fade" fontFamily="var(--font-inter), system-ui, sans-serif" fontSize="13" fill="#15130f">
        <line x1="40" y1="20" x2="72" y2="20" stroke="#15130f" strokeWidth="2" />
        <text x="80" y="24">
          {t("cut")}
        </text>
        <line x1="140" y1="20" x2="172" y2="20" stroke="#1e4a36" strokeWidth="2" strokeDasharray="6 5" />
        <text x="180" y="24">
          {t("fold")}
        </text>
      </g>

      {/* Cartulina */}
      <path d={OUTLINE} fill="#ffffff" fillOpacity="0.72" />

      {/* Marca impresa en la cara frontal */}
      <g className="dieline-fade" aria-hidden="true">
        <rect x="170" y="176" width="44" height="32" rx="2" fill="#1e4a36" />
        <path d="M170 180 L178 168 H206 L214 180 Z" fill="#b98b57" />
        <text
          x="192"
          y="232"
          textAnchor="middle"
          fontFamily="var(--font-inter), system-ui, sans-serif"
          fontSize="13"
          fontWeight="700"
          fill="#1e4a36"
        >
          {brand.name}
        </text>
      </g>

      {/* Pliegues */}
      <g className="dieline-fade" fill="none" stroke="#1e4a36" strokeWidth="1.6" strokeDasharray="6 5">
        {FOLDS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Corte */}
      <path
        d={OUTLINE}
        fill="none"
        stroke="#15130f"
        strokeWidth="2.2"
        strokeLinejoin="round"
        className="dieline-draw"
        style={{ "--dash-length": 1700 } as React.CSSProperties}
      />

      {/* Cotas */}
      <g className="dieline-fade" stroke="#6f5132" strokeWidth="1.2" fontFamily="var(--font-inter), system-ui, sans-serif" fontSize="13">
        <path d="M132 396 H252 M132 390 V402 M252 390 V402" fill="none" />
        <text x="192" y="414" textAnchor="middle" fill="#6f5132" stroke="none">
          {t("length")}
        </text>
        <path d="M252 396 H322 M322 390 V402" fill="none" />
        <text x="287" y="414" textAnchor="middle" fill="#6f5132" stroke="none">
          {t("width")}
        </text>
        <path d="M470 120 V280 M464 120 H476 M464 280 H476" fill="none" />
        <text x="480" y="204" fill="#6f5132" stroke="none">
          {t("height")}
        </text>
      </g>
    </svg>
  );
}
