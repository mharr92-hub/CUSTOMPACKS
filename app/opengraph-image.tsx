import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";

export const alt = `${brand.name} — ${brand.slogan}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen para redes: fondo kraft, slogan y el troquel de la marca. */
export default async function OpengraphImage() {
  const [bold, regular] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/inter-latin-800-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/inter-latin-400-normal.woff")),
  ]);
  const t = serverT("footer");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#e2c9a3", padding: 64, fontFamily: "Inter" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 660 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 34, background: "#1e4a36", borderRadius: 3 }} />
            <div style={{ fontSize: 34, fontWeight: 800, color: "#15130f" }}>{brand.name}</div>
          </div>
          <div style={{ fontSize: 86, fontWeight: 800, lineHeight: 0.95, letterSpacing: -3, color: "#15130f" }}>{brand.slogan}</div>
          <div style={{ fontSize: 28, color: "#15130f", opacity: 0.85 }}>{t("tagline")}</div>
        </div>
        <svg width="420" height="500" viewBox="0 0 520 420" style={{ marginLeft: 20, marginTop: 20 }}>
          <path
            d="M62 120 L68 84 L126 84 L132 120 L252 120 L258 84 L316 84 L322 120 L322 50 L326 36 Q328 32 334 32 L430 32 Q436 32 438 36 L442 50 L442 280 L322 280 L316 316 L258 316 L252 280 L252 350 L248 364 Q246 368 240 368 L144 368 Q138 368 136 364 L132 350 L132 280 L126 316 L68 316 L62 280 L40 268 L40 132 Z"
            fill="#ffffff"
            fillOpacity="0.7"
            stroke="#15130f"
            strokeWidth="2.4"
          />
          <path d="M62 120 V280 M132 120 V280 M252 120 V280 M322 120 V280 M62 120 H132 M252 120 H442 M322 50 H442 M62 280 H322 M132 350 H252" stroke="#1e4a36" strokeWidth="2" strokeDasharray="7 6" fill="none" />
        </svg>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: bold, weight: 800, style: "normal" },
        { name: "Inter", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
