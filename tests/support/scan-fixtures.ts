import { createElement as h } from "react";
import { Document, Page, renderToBuffer, View } from "@react-pdf/renderer";
import sharp from "sharp";

/** Escaneo simulado: un recuadro de color sobre una hoja blanca con margen. */
export async function scannedJpeg(width = 3000, height = 2200, color = "#2f5d3a"): Promise<Buffer> {
  const inner = await sharp({ create: { width: Math.round(width / 2), height: Math.round(height / 2), channels: 3, background: color } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: "#fdfdfd" } })
    .composite([{ input: inner, left: Math.round(width / 4), top: Math.round(height / 4) }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** PDF de varias páginas, cada una con un recuadro de color centrado. */
export async function scannedPdf(colors: readonly string[]): Promise<Buffer> {
  const doc = h(
    Document,
    null,
    ...colors.map((color, i) =>
      h(Page, { key: i, size: "A4", style: { padding: 120, backgroundColor: "#ffffff" } }, h(View, { style: { flexGrow: 1, backgroundColor: color } })),
    ),
  );
  return Buffer.from(await renderToBuffer(doc));
}
