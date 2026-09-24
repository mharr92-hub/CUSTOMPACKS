/**
 * Mapa del sitio (PRD §17). Las etiquetas son claves de `messages/es.json` > nav.
 */
export type NavKey =
  | "home"
  | "catalog"
  | "catalogBoxes"
  | "catalogBags"
  | "catalogPremium"
  | "catalogFood"
  | "gallery"
  | "howItWorks"
  | "sustainability"
  | "clients"
  | "quote"
  | "about"
  | "faq"
  | "contact"
  | "privacy"
  | "terms";

export type NavItem = { key: NavKey; href: string };

/** Navegación principal del header (escritorio y menú móvil). */
export const mainNav: readonly NavItem[] = [
  { key: "catalog", href: "/catalogo" },
  { key: "gallery", href: "/galeria" },
  { key: "howItWorks", href: "/como-funciona" },
  { key: "sustainability", href: "/sostenibilidad" },
  { key: "clients", href: "/clientes" },
  { key: "faq", href: "/faq" },
  { key: "contact", href: "/contacto" },
];

/** Categorías del catálogo (slugs estables; ver supabase/seed.sql). */
export const catalogNav: readonly NavItem[] = [
  { key: "catalogBoxes", href: "/catalogo/cajas" },
  { key: "catalogBags", href: "/catalogo/bolsas" },
  { key: "catalogPremium", href: "/catalogo/bolsas-premium" },
  { key: "catalogFood", href: "/catalogo/empaque-alimentario" },
];

export const companyNav: readonly NavItem[] = [
  { key: "about", href: "/nosotros" },
  { key: "howItWorks", href: "/como-funciona" },
  { key: "sustainability", href: "/sostenibilidad" },
  { key: "clients", href: "/clientes" },
  { key: "faq", href: "/faq" },
  { key: "contact", href: "/contacto" },
];

export const legalNav: readonly NavItem[] = [
  { key: "privacy", href: "/legal/privacidad" },
  { key: "terms", href: "/legal/terminos" },
];

export const QUOTE_HREF = "/cotizar";
