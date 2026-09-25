/**
 * Formato del RFQ a fábrica (Excel y tabla del PDF). Una fila por pieza y
 * cantidad; las últimas columnas quedan vacías para que la fábrica las llene.
 * Para adaptarlo al formato que pida la fábrica (PRD §20): cambiar el orden,
 * quitar columnas o ajustar anchos aquí. Los títulos están en
 * messages/es.json > rfq.columns.
 */
export type RfqRow = {
  request: string;
  piece: number;
  typeCode: string;
  typeName: string;
  category: string;
  sizeCode: string;
  size: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  paperCode: string;
  paper: string;
  caliberCode: string;
  caliber: string;
  printCode: string;
  print: string;
  pantone: string;
  faces: string;
  coverage: string;
  finishes: string;
  food: string;
  eco: string;
  product: string;
  weightG: number | null;
  productDims: string;
  conditions: string;
  uses: string;
  quantity: number;
  frequency: string;
  artwork: string;
};

export type RfqColumn = {
  key: keyof RfqRow | "unitCost" | "currency" | "productionDays" | "factoryNotes";
  /** Ancho en caracteres para Excel. */
  width: number;
  /** true: la llena la fábrica (vacía en el RFQ). */
  factory?: boolean;
};

export const RFQ_COLUMNS: readonly RfqColumn[] = [
  { key: "request", width: 16 },
  { key: "piece", width: 6 },
  { key: "typeCode", width: 9 },
  { key: "typeName", width: 28 },
  { key: "category", width: 16 },
  { key: "sizeCode", width: 10 },
  { key: "size", width: 30 },
  { key: "lengthCm", width: 9 },
  { key: "widthCm", width: 9 },
  { key: "heightCm", width: 9 },
  { key: "paperCode", width: 9 },
  { key: "paper", width: 28 },
  { key: "caliberCode", width: 9 },
  { key: "caliber", width: 16 },
  { key: "printCode", width: 9 },
  { key: "print", width: 22 },
  { key: "pantone", width: 18 },
  { key: "faces", width: 12 },
  { key: "coverage", width: 12 },
  { key: "finishes", width: 24 },
  { key: "food", width: 24 },
  { key: "eco", width: 24 },
  { key: "product", width: 28 },
  { key: "weightG", width: 9 },
  { key: "productDims", width: 20 },
  { key: "conditions", width: 18 },
  { key: "uses", width: 18 },
  { key: "quantity", width: 10 },
  { key: "frequency", width: 14 },
  { key: "artwork", width: 34 },
  { key: "unitCost", width: 14, factory: true },
  { key: "currency", width: 8, factory: true },
  { key: "productionDays", width: 12, factory: true },
  { key: "factoryNotes", width: 30, factory: true },
];
