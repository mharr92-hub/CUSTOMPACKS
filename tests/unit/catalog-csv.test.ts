import { describe, expect, it } from "vitest";
import { normalizeHeader, parseCsv, toCsv } from "@/lib/catalog/csv";
import { readCatalogRows, type Issue } from "@/lib/catalog/catalog-csv";

describe("CSV de las plantillas", () => {
  it("lee lo que guarda Excel en español: punto y coma, BOM, comillas y saltos de línea", () => {
    const text = '﻿Clase;Código;Nombre;Descripción\r\ntipo;CJ-01;"Caja ""premium""";"Línea 1\nlínea 2"\r\n;;;\r\npapel;PA-01;Kraft;\r\n';
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["clase", "codigo", "nombre", "descripcion"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.values).toEqual({ clase: "tipo", codigo: "CJ-01", nombre: 'Caja "premium"', descripcion: "Línea 1\nlínea 2" });
    expect(rows[1]?.line).toBe(5);
  });

  it("escribe con BOM y comillas donde hace falta, y se vuelve a leer igual", () => {
    const csv = toCsv(["código", "nombre"], [["CJ-01", "Caja, con coma"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv).rows[0]?.values).toEqual({ codigo: "CJ-01", nombre: "Caja, con coma" });
    expect(normalizeHeader("Peso máx g")).toBe("peso_max_g");
  });

  it("convierte los valores en español y explica lo que no entiende", () => {
    const issues: Issue[] = [];
    const { rows } = parseCsv(
      [
        "clase,código,nombre,categoría,segmento,familia,papel,tamaños,aptitud,activo,provisional",
        "tipo,cj-20,Caja nueva,CAJ,Comercial | Alimentario,Caja de alimentos,PA-01 | PA-02,,,sí,no",
        "tamaño,CJ-S20,S20,,,caja,,\"12,5 x 8 x 4\",,,",
        "papel,PA-20,Kraft,,,,,,grasa | tibio,quizás,",
      ].join("\n"),
    );
    const { entries, rules } = readCatalogRows("x.csv", rows, issues);
    expect(entries[0]).toMatchObject({ code: "CJ-20", segments: ["commercial", "food"], family: "food_box", isActive: true, isProvisional: false });
    expect(rules.map((r) => r.paperCode)).toEqual(["PA-01", "PA-02"]);
    expect(entries[1]?.dims).toEqual([12.5, 8, 4]);
    expect(entries[2]?.conditions).toEqual(["grease"]);
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringMatching(/"activo" debe ser sí o no/),
      expect.stringMatching(/"aptitud": no se reconoce "tibio". Valores posibles: caliente, frío/),
    ]);
  });
});
