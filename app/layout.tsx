import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getTranslations } from "next-intl/server";
import { ErrorReporter } from "@/components/error-reporter";
import { brand } from "@/config/brand";
import "./globals.css";

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
  // Sin precarga: el texto se pinta al instante con la fuente de respaldo ajustada
  // y la fuente no compite con el HTML en conexiones lentas (LCP móvil).
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(brand.siteUrl),
    title: {
      default: t("defaultTitle", { brand: brand.name }),
      template: t("titleTemplate", { brand: brand.name }),
    },
    description: t("description"),
    applicationName: brand.name,
    openGraph: { siteName: brand.name, locale: "es_PA", type: "website" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: brand.colors.forest,
  width: "device-width",
  initialScale: 1,
};

/**
 * Raíz mínima: cada sección (sitio, cotizador, seguimiento, panel) monta sus
 * propios providers para no cargar JS ni textos que no usa.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="flex min-h-dvh flex-col antialiased">
        {children}
        {process.env.NEXT_PUBLIC_SENTRY_DSN ? <ErrorReporter /> : null}
      </body>
    </html>
  );
}
