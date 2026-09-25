import "server-only";
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import { pdf, PdfFooter, PdfHeader, PdfRow, formatPdfDate } from "@/lib/pdf/common";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import type { ItemSpec } from "@/lib/quote/spec";
import { formatMoney, formatUnitPrice } from "./pricing";

/**
 * Cotización formal en PDF (PRD §11): precios por cantidad, vigencia,
 * condiciones 50/50, plazo y notas. Precios sin impuesto, con la leyenda de
 * `settings.tax_label` (D-102).
 */
export type QuotePdfInput = {
  number: string;
  requestNumber: string;
  issuedAt: Date;
  validUntil: string;
  currency: string;
  depositPct: number;
  client: { company: string | null; contact: string; email: string | null; whatsapp: string | null; city: string | null; address: string | null };
  items: { position: number; spec: ItemSpec; lines: { quantity: number; unitPrice: number; subtotal: number; leadTimeDays: number }[] }[];
  notes: string | null;
  trackingLink: string;
  /** Leyenda de impuestos, p. ej. "más ITBMS 7 %" (vacía: no se muestra). */
  taxLabel: string;
};

function QuoteDocument({ input }: { input: QuotePdfInput }) {
  const t = serverT("quotePdf");
  const ts = serverT("spec");
  const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);
  const summary = (spec: ItemSpec) =>
    [
      spec.size.standard ? `${spec.size.standard.name}` : spec.size.custom ? `${spec.size.custom.l} × ${spec.size.custom.w} × ${spec.size.custom.h} cm` : null,
      spec.paper?.name,
      spec.caliber?.name,
      spec.print.option?.name,
      spec.print.pantone.length ? spec.print.pantone.join(", ") : null,
      spec.finishes.map((f) => f.name).join(", ") || null,
    ]
      .filter(Boolean)
      .join(" · ") || ts("advice");
  return (
    <Document title={`${t("title")} ${input.number}`} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={pdf.page}>
        <PdfHeader
          brand={brand.name}
          title={t("title")}
          meta={[input.number, t("issued", { date: formatPdfDate(input.issuedAt) }), t("validUntil", { date: formatPdfDate(input.validUntil) })]}
        />
        <View style={pdf.block}>
          <PdfRow label={t("client")} value={input.client.company ?? input.client.contact} />
          <PdfRow label={t("contact")} value={[input.client.contact, input.client.email, input.client.whatsapp].filter(Boolean).join(" · ")} />
          <PdfRow label={t("delivery")} value={[input.client.address, input.client.city].filter(Boolean).join(", ") || ts("none")} />
          <PdfRow label={t("request")} value={input.requestNumber} />
        </View>
        {input.items.map((item) => (
          <View key={item.position} style={pdf.piece} wrap={false}>
            <Text style={pdf.pieceHeader}>{t("piece", { n: item.position, name: item.spec.type ? `${item.spec.type.code} · ${item.spec.type.name}` : ts("typeAdvice") })}</Text>
            <View style={pdf.pieceBody}>
              <Text style={{ marginTop: 6, color: "#5b5448" }}>{summary(item.spec)}</Text>
              <View style={pdf.table}>
                <View style={pdf.th}>
                  <Text style={pdf.cell}>{t("quantity")}</Text>
                  <Text style={pdf.cellRight}>{t("unitPrice")}</Text>
                  <Text style={pdf.cellRight}>{input.taxLabel ? t("subtotalTax", { label: input.taxLabel }) : t("subtotal")}</Text>
                  <Text style={pdf.cellRight}>{t("leadTime")}</Text>
                </View>
                {item.lines.map((line) => (
                  <View key={line.quantity} style={pdf.tr}>
                    <Text style={pdf.cell}>{fmtInt(line.quantity)}</Text>
                    <Text style={pdf.cellRight}>{formatUnitPrice(line.unitPrice, input.currency)}</Text>
                    <Text style={pdf.cellRight}>{formatMoney(line.subtotal, input.currency)}</Text>
                    <Text style={pdf.cellRight}>{t("leadTimeDays", { days: line.leadTimeDays })}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
        <View style={pdf.note} wrap={false}>
          <Text style={pdf.blockTitle}>{t("conditionsTitle")}</Text>
          <Text>{t("payment", { deposit: input.depositPct, balance: 100 - input.depositPct })}</Text>
          <Text>{t("currency", { currency: input.currency })}</Text>
          {input.taxLabel ? <Text>{t("tax", { label: input.taxLabel })}</Text> : null}
          <Text>{t("validity", { date: formatPdfDate(input.validUntil) })}</Text>
          <Text>{t("leadTimeRule", { city: input.client.city ?? ts("none") })}</Text>
          {input.items.some((i) => i.lines.length > 1) ? <Text>{t("options")}</Text> : null}
        </View>
        {input.notes ? (
          <View style={pdf.block} wrap={false}>
            <Text style={pdf.blockTitle}>{t("notes")}</Text>
            <Text>{input.notes}</Text>
          </View>
        ) : null}
        <Text style={[pdf.block, { color: "#1e4a36" }]}>{t("accept", { link: input.trackingLink })}</Text>
        <PdfFooter text={t("footer", { brand: brand.name, number: input.number })} />
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<QuoteDocument input={input} />);
}
