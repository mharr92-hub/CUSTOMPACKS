import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import type { LeadTimeSettings } from "@/lib/leadtime";
import { specRows, type SpecTranslator } from "@/lib/quote/spec";
import type { TrackingRequest } from "@/lib/quote/tracking";
import { registerPdfFonts } from "./fonts";

/**
 * Ficha técnica de la solicitud en PDF (PRD §8 "Salida de una solicitud"):
 * marca, número, datos del cliente y la ficha de cada pieza. Sin precios.
 */
const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: "#15130f", paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: "#1e4a36", paddingBottom: 10 },
  brand: { fontSize: 16, fontWeight: 800, color: "#1e4a36" },
  title: { fontSize: 20, fontWeight: 800, marginTop: 2 },
  meta: { textAlign: "right", color: "#5b5448" },
  number: { fontSize: 12, fontWeight: 800, color: "#15130f" },
  block: { marginTop: 16 },
  blockTitle: { fontSize: 11, fontWeight: 800, marginBottom: 6, color: "#1e4a36" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e4ddd2", paddingVertical: 3.5 },
  label: { width: 140, color: "#5b5448" },
  value: { flex: 1 },
  piece: { marginTop: 16, borderWidth: 0.75, borderColor: "#e4ddd2", borderRadius: 3 },
  pieceHeader: { backgroundColor: "#ebdcc6", paddingVertical: 6, paddingHorizontal: 8, fontWeight: 800, fontSize: 10.5 },
  pieceBody: { paddingHorizontal: 8, paddingBottom: 4 },
  conditions: { marginTop: 18, padding: 8, backgroundColor: "#f3f1ed", color: "#15130f" },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#5b5448" },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

function SpecSheetDocument({ request, conditions }: { request: TrackingRequest; conditions: SheetConditions }) {
  const t = serverT("pdf");
  const ts = serverT("spec");
  const tw = serverT("wizard");
  const specT: SpecTranslator = (key, values) => ts(key as "none", values as never);
  const date = new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeZone: "America/Panama" }).format(request.submittedAt);
  const client = [request.contactName, request.companyName, request.contactWhatsapp, request.contactEmail].filter(Boolean).join(" · ");
  const delivery = [request.deliveryAddress, request.deliveryCity].filter(Boolean).join(", ");
  return (
    <Document title={`${request.number} · ${t("title")}`} author={brand.name} creator={brand.name} producer={brand.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>{brand.name}</Text>
            <Text style={s.title}>{t("title")}</Text>
          </View>
          <View style={s.meta}>
            <Text style={s.number}>{t("request", { number: request.number })}</Text>
            <Text>{t("date", { date })}</Text>
          </View>
        </View>

        <View style={s.block}>
          <Row label={t("client")} value={client} />
          <Row label={tw("summary.segment")} value={tw(`segmentOptions.${request.segment}`)} />
          <Row label={t("delivery")} value={delivery || ts("none")} />
          <Row label={t("desiredDate")} value={request.desiredDate ?? ts("none")} />
        </View>

        {request.items.map((item) => (
          <View key={item.id} style={s.piece}>
            <Text style={s.pieceHeader}>
              {t("piece", { n: item.position })}
              {item.spec.type ? `: ${item.spec.type.code} · ${item.spec.type.name}` : ""}
            </Text>
            <View style={s.pieceBody}>
              {specRows(item.spec, specT).map((r) => (
                <Row key={r.label} label={r.label} value={r.value} />
              ))}
            </View>
          </View>
        ))}

        <Text style={s.conditions}>
          {t("conditions", {
            deposit: conditions.depositPct,
            balance: 100 - conditions.depositPct,
            standard: conditions.leadTime.standardDays,
            small: conditions.leadTime.smallDays,
            threshold: new Intl.NumberFormat("es-PA").format(conditions.leadTime.thresholdUnits),
          })}
        </Text>

        <View style={s.footer} fixed>
          <Text>{t("footer", { brand: brand.name, site: brand.siteUrl.replace(/^https?:\/\//, "") })}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Condiciones comerciales vigentes (desde settings). */
export type SheetConditions = { depositPct: number; leadTime: LeadTimeSettings };

export async function renderSpecSheetPdf(request: TrackingRequest, conditions: SheetConditions): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<SpecSheetDocument request={request} conditions={conditions} />);
}
