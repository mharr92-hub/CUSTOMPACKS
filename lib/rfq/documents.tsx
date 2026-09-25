import "server-only";
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import * as XLSX from "xlsx";
import { brand } from "@/config/brand";
import { RFQ_COLUMNS, type RfqRow } from "@/config/rfq-format";
import { serverT } from "@/lib/i18n";
import { pdf, PdfFooter, PdfHeader, PdfRow, formatPdfDate } from "@/lib/pdf/common";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { specRows, type ItemSpec, type SpecTranslator } from "@/lib/quote/spec";

/** Datos del RFQ: todo sale de la solicitud y su ficha congelada. */
export type RfqDocumentInput = {
  rfqNumber: string;
  requestNumber: string;
  segment: string;
  destination: string;
  desiredDate: string | null;
  createdAt: Date;
  items: { position: number; spec: ItemSpec; artwork: string }[];
  rows: RfqRow[];
};

function RfqDocument({ input }: { input: RfqDocumentInput }) {
  const t = serverT("rfq");
  const ts = serverT("spec");
  const specT: SpecTranslator = (key, values) => ts(key as "none", values as never);
  const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);
  return (
    <Document title={t("number", { number: input.rfqNumber })} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={pdf.page}>
        <PdfHeader brand={brand.name} title={t("title")} meta={[t("number", { number: input.rfqNumber }), t("date", { date: formatPdfDate(input.createdAt) })]} />
        <View style={pdf.block}>
          <PdfRow label={t("request")} value={input.requestNumber} />
          <PdfRow label={t("segment")} value={input.segment} />
          <PdfRow label={t("destination")} value={input.destination} />
          <PdfRow label={t("desiredDate")} value={input.desiredDate ? formatPdfDate(input.desiredDate) : ts("none")} />
        </View>
        <Text style={pdf.note}>{t("instructions")}</Text>
        {input.items.map((item) => (
          <View key={item.position} style={pdf.piece} wrap={false}>
            <Text style={pdf.pieceHeader}>{`${t("columns.piece")} ${item.position}${item.spec.type ? `: ${item.spec.type.code} · ${item.spec.type.name}` : ""}`}</Text>
            <View style={pdf.pieceBody}>
              {specRows(item.spec, specT)
                .filter((r) => r.label !== ts("quantities") && r.label !== ts("artwork"))
                .map((r) => (
                  <PdfRow key={r.label} label={r.label} value={r.value} />
                ))}
              <PdfRow label={t("artwork")} value={item.artwork} />
              <Text style={[pdf.blockTitle, { marginTop: 8, marginBottom: 0 }]}>{t("quantities")}</Text>
              <View style={pdf.table}>
                <View style={pdf.th}>
                  <Text style={pdf.cell}>{t("quantity")}</Text>
                  <Text style={pdf.cell}>{t("unitCost")}</Text>
                  <Text style={pdf.cell}>{t("currency")}</Text>
                  <Text style={pdf.cell}>{t("productionDays")}</Text>
                </View>
                {(item.spec.quantities.length ? item.spec.quantities : [0]).map((q) => (
                  <View key={q} style={pdf.tr}>
                    <Text style={pdf.cell}>{q ? fmtInt(q) : ts("none")}</Text>
                    <Text style={pdf.cell}> </Text>
                    <Text style={pdf.cell}> </Text>
                    <Text style={pdf.cell}> </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
        <PdfFooter text={t("footer", { brand: brand.name, number: input.rfqNumber })} />
      </Page>
    </Document>
  );
}

export async function renderRfqPdf(input: RfqDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<RfqDocument input={input} />);
}

/** Excel del RFQ: una fila por pieza y cantidad; las columnas finales las llena la fábrica. */
export function renderRfqXlsx(input: RfqDocumentInput): Buffer {
  const t = serverT("rfq");
  const header = RFQ_COLUMNS.map((c) => t(`columns.${c.key}`));
  const body = input.rows.map((row) => RFQ_COLUMNS.map((c) => (c.factory ? "" : (row[c.key as keyof RfqRow] ?? ""))));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = RFQ_COLUMNS.map((c) => ({ wch: c.width }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: RFQ_COLUMNS.length - 1 } }) };
  const info = XLSX.utils.aoa_to_sheet([
    [t("number", { number: "" }).trim(), input.rfqNumber],
    [t("request"), input.requestNumber],
    [t("segment"), input.segment],
    [t("destination"), input.destination],
    [t("desiredDate"), input.desiredDate ?? ""],
    [],
    [t("instructions")],
  ]);
  info["!cols"] = [{ wch: 28 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, t("sheet"));
  XLSX.utils.book_append_sheet(book, info, t("infoSheet"));
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}
