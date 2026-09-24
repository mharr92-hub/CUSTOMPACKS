import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import "./globals.css";

const inter = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="flex min-h-dvh flex-col antialiased">
        <NextIntlClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
