import { deflateSync } from "node:zlib";

/**
 * Imagen de ejemplo para la demo (foto de QA): una caja kraft ilustrada sobre
 * una mesa, en PNG, sin dependencias. No pretende ser una foto real: la
 * evidencia queda marcada como DEMO.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

type RGB = [number, number, number];

export function demoQaPhoto(width = 800, height = 600): Buffer {
  const px = Buffer.alloc(width * height * 3);
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    const i = (y * width + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  const table: RGB = [214, 208, 196];
  const wall: RGB = [238, 234, 226];
  const front: RGB = [176, 132, 86];
  const top: RGB = [199, 158, 110];
  const side: RGB = [150, 110, 70];
  const band: RGB = [30, 74, 54];
  const shadow: RGB = [190, 184, 172];
  // Caja: frente 340×220 en (230, 250); tapa y lateral en perspectiva.
  const fx = 230;
  const fy = 250;
  const fw = 340;
  const fh = 220;
  const depth = 70;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c: RGB = y < 330 ? wall : table;
      if (y >= fy + fh && y < fy + fh + 18 && x >= fx + 10 && x < fx + fw + depth) c = shadow;
      const inFront = x >= fx && x < fx + fw && y >= fy && y < fy + fh;
      const dyTop = fy - y; // tapa: paralelogramo sobre el frente
      const inTop = dyTop > 0 && dyTop <= depth && x >= fx + dyTop && x < fx + fw + dyTop;
      const dxSide = x - (fx + fw); // lateral derecho
      const inSide = dxSide >= 0 && dxSide < depth && y >= fy - dxSide && y < fy + fh - dxSide;
      if (inTop) c = top;
      if (inSide) c = side;
      if (inFront) {
        c = front;
        // Franja impresa y logo (rectángulo) en verde.
        if (y >= fy + 90 && y < fy + 120) c = band;
        if (x >= fx + 130 && x < fx + 210 && y >= fy + 30 && y < fy + 70) c = band;
      }
      set(x, y, c);
    }
  }
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filtro "none"
    px.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PDF mínimo válido de una página (arte de ejemplo del cliente). */
export function demoArtworkPdf(): Buffer {
  const content = "0.12 0.29 0.21 rg 30 60 140 80 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) body += `${String(o).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
