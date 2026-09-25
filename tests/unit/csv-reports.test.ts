import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("CSV para hojas de cálculo", () => {
  it("lleva BOM, comas, CRLF y comillas solo donde hace falta", () => {
    const csv = toCsv(["Tipo", "Piezas", "Conversión (%)"], [
      ["Caja plegadiza", 12, 41.7],
      ['Bolsa "kraft", con asa', 3, null],
      ["Línea\nnueva", 0, 0],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Tipo,Piezas,Conversión (%)",
      "Caja plegadiza,12,41.7",
      '"Bolsa ""kraft"", con asa",3,',
      '"Línea\nnueva",0,0',
      "",
    ]);
  });

  it("neutraliza fórmulas en textos (inyección CSV) pero no en números", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"http://x\")", -5], ["@SUM(A1)", 1.5]]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")",-5`);
    expect(lines[2]).toBe("'@SUM(A1),1.5");
  });

  it("una hoja de cálculo lo lee con tildes, números como números y fechas ISO", () => {
    const csv = toCsv(["Pedido", "Entrega", "Días restantes", "Conversión (%)"], [["P-2026-00001", "2026-10-05", -2, 41.7], ["Año ñandú", "", 0, null]]);
    // Como una hoja de cálculo: decodifica los bytes en UTF-8 (el BOM marca la codificación y se descarta).
    const text = new TextDecoder("utf-8").decode(Buffer.from(csv, "utf8"));
    const book = XLSX.read(text, { type: "string" });
    const sheet = book.Sheets[book.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
    expect(rows[0]).toEqual(["Pedido", "Entrega", "Días restantes", "Conversión (%)"]);
    expect(rows[1]?.[0]).toBe("P-2026-00001");
    expect(rows[1]?.[2]).toBe(-2);
    expect(rows[1]?.[3]).toBe(41.7);
    expect(rows[2]?.[0]).toBe("Año ñandú");
  });
});
