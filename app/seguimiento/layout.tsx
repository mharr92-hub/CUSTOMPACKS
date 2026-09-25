import { IntlClientProvider } from "@/components/intl-client-provider";
import { SlimHeader } from "@/components/site/slim-header";

/** Sin analítica: la URL lleva el token del cliente (D-032). */
export default function TrackingLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlClientProvider namespaces={["upload", "artwork", "tracking"]}>
      <SlimHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
    </IntlClientProvider>
  );
}
