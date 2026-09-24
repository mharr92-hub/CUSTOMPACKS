/**
 * Identidad de marca. Todo sale de variables de entorno públicas para poder
 * cambiar nombre, slogan o contacto sin tocar código (ver docs/DECISIONES.md).
 * Las variables NEXT_PUBLIC_* deben leerse de forma literal para que Next las
 * incruste en el bundle del navegador.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "ProvenPack",
  slogan: process.env.NEXT_PUBLIC_BRAND_SLOGAN || "Probamos que somos los mejores",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Solo dígitos, con código de país (507 = Panamá). Valor de ejemplo hasta tener el real. */
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "50760000000").replace(/\D/g, ""),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hola@provenpack.com",
  locale: "es",
  country: "PA",
  /** Paleta neutra provisional: kraft, verde bosque y negro. Los tokens CSS viven en app/globals.css. */
  colors: {
    kraft: "#B98B57",
    kraftLight: "#EBDCC6",
    forest: "#1E4A36",
    ink: "#15130F",
    paper: "#FAF6EF",
  },
} as const;

export type Brand = typeof brand;
