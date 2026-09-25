import { AnalyticsScripts } from "@/components/analytics-scripts";
import { IntlClientProvider } from "@/components/intl-client-provider";
import { SlimHeader } from "@/components/site/slim-header";

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlClientProvider namespaces={["common", "wizard", "spec", "enums"]}>
      <SlimHeader />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <AnalyticsScripts />
    </IntlClientProvider>
  );
}
