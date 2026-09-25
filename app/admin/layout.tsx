import { IntlClientProvider } from "@/components/intl-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlClientProvider namespaces={["common", "admin", "enums", "upload", "artwork"]}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </IntlClientProvider>
  );
}
