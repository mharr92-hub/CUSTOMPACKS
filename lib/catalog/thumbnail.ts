/**
 * Miniatura de una foto importada con `pnpm gallery:import` o
 * `pnpm catalog:import` (misma ruta con "-mini"). Para cualquier otra foto
 * devuelve la original.
 */
export function thumbnailUrl(url: string): string {
  return /\/import-[0-9a-f]{16}\.webp$/.test(url) ? url.replace(/\.webp$/, "-mini.webp") : url;
}
