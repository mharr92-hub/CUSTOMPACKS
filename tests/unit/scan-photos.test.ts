import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { scannedJpeg, scannedPdf } from "../support/scan-fixtures";

vi.mock("server-only", () => ({}));
const { pdfPages, processPhoto, scanImages, thumbnailUrl } = await import("@/lib/catalog/photos");

describe("fotos desde escaneos", () => {
  it("recorta el margen blanco de un JPG grande y genera WebP y miniatura", async () => {
    const jpg = await scannedJpeg(3000, 2200);
    const out = await processPhoto(jpg);
    const full = await sharp(out.full).metadata();
    const thumb = await sharp(out.thumb).metadata();
    expect(full.format).toBe("webp");
    expect(thumb.format).toBe("webp");
    // El recuadro mide 1500 × 1100: el margen blanco se fue.
    expect(out.width).toBeGreaterThan(1450);
    expect(out.width).toBeLessThan(1560);
    expect(Math.max(thumb.width ?? 0, thumb.height ?? 0)).toBe(480);
  });

  it("separa un PDF de varias páginas en una imagen por página", async () => {
    const pdf = await scannedPdf(["#2f5d3a", "#b5651d", "#111111"]);
    const pages = await pdfPages(pdf);
    expect(pages).toHaveLength(3);
    const photo = await processPhoto(pages[1]!);
    const { data } = await sharp(photo.full).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    // Tras recortar el margen, el color dominante es el del recuadro (marrón).
    expect(data[0]).toBeGreaterThan(150);
    expect(data[2]).toBeLessThan(80);
    expect(await scanImages(Buffer.from("no es nada"), "x.txt")).toEqual([]);
  });

  it("la miniatura sigue la convención -mini solo para fotos importadas", () => {
    expect(thumbnailUrl("https://x/catalog/gallery_samples/1/import-0123456789abcdef.webp")).toBe("https://x/catalog/gallery_samples/1/import-0123456789abcdef-mini.webp");
    expect(thumbnailUrl("https://x/catalog/p/foto.jpg")).toBe("https://x/catalog/p/foto.jpg");
  });
});
