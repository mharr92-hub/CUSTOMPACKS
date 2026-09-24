import { getRequestConfig } from "next-intl/server";

/**
 * Solo español en el MVP; la arquitectura queda lista para inglés (fase 2):
 * basta con agregar messages/en.json y resolver el locale aquí.
 */
export default getRequestConfig(async () => {
  const locale = "es";
  return {
    locale,
    timeZone: "America/Panama",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
