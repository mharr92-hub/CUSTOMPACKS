import "server-only";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import type { LeadTimeSettings } from "@/lib/leadtime";
import { specRows, type SpecTranslator } from "@/lib/quote/spec";
import type { TrackingRequest } from "@/lib/quote/tracking";
import { pdf as s, PdfRow as Row } from "./common";
import { registerPdfFonts } from "./fonts";

/**
 * Ficha técnica de la solicitud en PDF (PRD §8 "Salida de una solicitud"):
 * marca, número, datos del cliente y la ficha de cada pieza. Sin precios.
 */
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

        <Text style={s.note}>
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
