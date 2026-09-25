import "server-only";
import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import { pdf, PdfFooter, PdfHeader, PdfRow, formatPdfDate } from "@/lib/pdf/common";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { formatMoney, formatUnitPrice } from "@/lib/quotes/pricing";
import type { OrderDetail } from "./index";

/**
 * Estado de pagos del pedido (PDF): total, anticipo y saldo con lo pagado,
 * con la leyenda de impuestos (D-102).
 */
function StatementDocument({ order, taxLabel }: { order: OrderDetail; taxLabel: string }) {
  const t = serverT("statementPdf");
  const fmtInt = (n: number) => new Intl.NumberFormat("es-PA").format(n);
  const confirmed = order.payments.filter((p) => p.status === "confirmed");
  const paid = (kind: "deposit" | "balance") => confirmed.filter((p) => p.kind === kind).reduce((s, p) => s + (p.amount ?? 0), 0);
  return (
    <Document title={`${t("title")} ${order.number}`} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={pdf.page}>
        <PdfHeader brand={brand.name} title={t("title")} meta={[t("order", { number: order.number }), t("date", { date: formatPdfDate(new Date()) })]} />
        <View style={pdf.block}>
          <PdfRow label={t("client")} value={order.company} />
          <PdfRow label={t("quote")} value={order.quoteNumber} />
        </View>
        <Text style={[pdf.blockTitle, { marginTop: 16 }]}>{t("items")}</Text>
        <View style={pdf.table}>
          <View style={pdf.th}>
            <Text style={[pdf.cell, { flex: 2 }]}>{t("items")}</Text>
            <Text style={pdf.cellRight}>{t("quantity")}</Text>
            <Text style={pdf.cellRight}>{t("unitPrice")}</Text>
            <Text style={pdf.cellRight}>{t("subtotal")}</Text>
          </View>
          {order.items.map((i) => (
            <View key={i.id} style={pdf.tr}>
              <Text style={[pdf.cell, { flex: 2 }]}>{`${i.position}. ${i.spec?.type ? `${i.spec.type.code} · ${i.spec.type.name}` : ""}`}</Text>
              <Text style={pdf.cellRight}>{fmtInt(i.quantity)}</Text>
              <Text style={pdf.cellRight}>{formatUnitPrice(i.unitPrice, order.currency)}</Text>
              <Text style={pdf.cellRight}>{formatMoney(i.subtotal, order.currency)}</Text>
            </View>
          ))}
        </View>
        <View style={pdf.block}>
          <PdfRow label={t("total")} value={formatMoney(order.total, order.currency)} />
          <PdfRow
            label={t("deposit", { pct: order.depositPct })}
            value={`${formatMoney(order.depositAmount, order.currency)} · ${t("paid")} ${formatMoney(paid("deposit"), order.currency)} · ${t("pending")} ${formatMoney(Math.max(0, order.depositAmount - paid("deposit")), order.currency)}`}
          />
          <PdfRow
            label={t("balance", { pct: 100 - order.depositPct })}
            value={`${formatMoney(order.balanceAmount, order.currency)} · ${t("paid")} ${formatMoney(paid("balance"), order.currency)} · ${t("pending")} ${formatMoney(Math.max(0, order.balanceAmount - paid("balance")), order.currency)}`}
          />
          {taxLabel ? <Text style={{ marginTop: 4 }}>{t("tax", { label: taxLabel })}</Text> : null}
        </View>
        <View style={pdf.note}>
          <Text style={pdf.blockTitle}>{t("payments")}</Text>
          {confirmed.length === 0 ? <Text>{t("none")}</Text> : null}
          {confirmed.map((p) => (
            <Text key={p.id}>
              {t("paymentLine", {
                date: p.paidOn ? formatPdfDate(p.paidOn) : "",
                kind: t(`kinds.${p.kind}`),
                amount: formatMoney(p.amount ?? 0, p.currency),
                method: p.method ? ` · ${p.method}` : "",
              })}
            </Text>
          ))}
        </View>
        <PdfFooter text={t("footer", { brand: brand.name, number: order.number })} />
      </Page>
    </Document>
  );
}

export async function renderStatementPdf(order: OrderDetail, taxLabel: string): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<StatementDocument order={order} taxLabel={taxLabel} />);
}
