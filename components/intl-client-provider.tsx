import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { Messages } from "@/lib/i18n";

/**
 * Pasa al navegador solo los namespaces de textos que usan los componentes
 * cliente de esa sección (el resto se queda en el servidor y no pesa en el
 * HTML de cada página).
 */
export async function IntlClientProvider({
  namespaces,
  children,
}: {
  namespaces: readonly (keyof Messages)[];
  children: React.ReactNode;
}) {
  const all = (await getMessages()) as Messages;
  const picked = Object.fromEntries(namespaces.map((ns) => [ns, all[ns]]));
  return <NextIntlClientProvider messages={picked}>{children}</NextIntlClientProvider>;
}
