import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { getPublicCatalog } from "@/lib/catalog/public";
import { productHref, visibleTypes } from "@/lib/catalog/view";
import { log } from "@/lib/log";

export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/catalogo",
  "/galeria",
  "/como-funciona",
  "/sostenibilidad",
  "/clientes",
  "/nosotros",
  "/faq",
  "/contacto",
  "/cotizar",
  "/legal/privacidad",
  "/legal/terminos",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string) => `${brand.siteUrl}${path === "/" ? "" : path}`;
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: url(path),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : path === "/catalogo" ? 0.9 : 0.6,
  }));
  try {
    const catalog = await getPublicCatalog();
    for (const c of catalog.categories) entries.push({ url: url(`/catalogo/${c.slug}`), changeFrequency: "weekly", priority: 0.8 });
    for (const ty of visibleTypes(catalog)) entries.push({ url: url(productHref(ty.category, ty)), changeFrequency: "weekly", priority: 0.8 });
  } catch (error) {
    log.warn("sitemap sin catálogo (base no disponible)", { error });
  }
  return entries;
}
