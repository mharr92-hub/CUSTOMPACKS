import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/** Origen de Supabase (API, Storage y URLs firmadas), si está configurado. */
function supabaseOrigin(): string {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

/**
 * Política de contenido (OWASP A03/A05). Scripts: los propios, GA4, Meta
 * Pixel y Turnstile. 'unsafe-inline' queda por los scripts en línea de Next.js
 * sin nonce (un nonce obligaría a renderizar todo en cada visita, D-086).
 * Nada puede incrustar el sitio (frame-ancestors) ni cargar plugins.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const ga = "https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com";
  const turnstile = "https://challenges.cloudflare.com";
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net ${turnstile}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${supabase} ${ga} https://www.facebook.com`,
    "font-src": "'self' data:",
    "connect-src": `'self' ${supabase} ${ga} https://www.facebook.com${isDev ? " ws: wss:" : ""}`,
    "media-src": `'self' blob: ${supabase}`,
    "frame-src": turnstile,
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "frame-ancestors": "'none'",
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.replace(/\s+/g, " ").trim()}`)
    .join("; ");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // Páginas: con CSP. Las rutas /api (PDF, CSV, JSON y archivos) llevan sus propias cabeceras.
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] },
    ];
  },
};

export default withNextIntl(nextConfig);
