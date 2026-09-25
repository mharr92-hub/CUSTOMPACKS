import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** Fotos públicas del catálogo servidas por Supabase Storage (si está configurado). */
function supabaseImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) return [];
  const { protocol, hostname } = new URL(url);
  return [{ protocol: protocol.replace(":", "") as "https" | "http", hostname, pathname: "/storage/v1/object/public/**" }];
}

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR permite un build/caché separado (lo usan los e2e con su propia base).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseImagePatterns(),
  },
  experimental: {
    // Fotos del catálogo se suben por Server Action (hasta 10 MB). El arte
    // de clientes va directo a Storage con URL firmada, no por aquí.
    serverActions: { bodySizeLimit: "11mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
