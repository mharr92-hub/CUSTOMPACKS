/**
 * CSV de las plantillas del catálogo. Acepta lo que guarda Excel en español:
 * separador coma o punto y coma (se detecta en la primera línea), BOM UTF-8,
 * comillas dobles y saltos de línea dentro de una celda. Los encabezados se
 * normalizan (minúsculas, sin tildes, espacios a "_") para que "Código" y
 * "codigo" sean la misma columna.
 */
export type CsvRow = { line: number; values: Record<string, string> };

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function detectSeparator(text: string): "," | ";" {
  const first = text.slice(0, text.search(/\r?\n/) === -1 ? text.length : text.search(/\r?\n/));
  const count = (ch: string) => first.split(ch).length - 1;
  return count(";") > count(",") ? ";" : ",";
}

/** Celdas por fila, con el número de línea del archivo donde empieza cada fila. */
export function parseCsvCells(input: string): { line: number; cells: string[] }[] {
  const text = input.replace(/^﻿/, "");
  const sep = detectSeparator(text);
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === "\n") line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === "") {
      cell = "";
      quoted = true;
    } else if (ch === sep) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      line += 1;
      rowLine = line;
    } else cell += ch;
  }
  if (cell !== "" || cells.length > 0) {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
  }
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
}

/** Filas como objetos por encabezado normalizado. La primera fila es el encabezado. */
export function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  const [head, ...body] = parseCsvCells(input);
  if (!head) return { headers: [], rows: [] };
  const headers = head.cells.map(normalizeHeader);
  return {
    headers,
    rows: body.map((r) => ({
      line: r.line,
      values: Object.fromEntries(headers.map((h, i) => [h, (r.cells[i] ?? "").trim()])),
    })),
  };
}

function quote(value: string): string {
  return /[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV con BOM (Excel lo abre con tildes) y separador coma. */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return `﻿${[headers, ...rows].map((r) => r.map((v) => quote(v ?? "")).join(",")).join("\r\n")}\r\n`;
}
