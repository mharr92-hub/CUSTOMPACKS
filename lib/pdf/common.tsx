import "server-only";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

/** Estilos y piezas comunes de los PDF con marca (ficha, RFQ, cotización). */
export const pdf = StyleSheet.create({
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
  pieceBody: { paddingHorizontal: 8, paddingBottom: 6 },
  note: { marginTop: 14, padding: 8, backgroundColor: "#f3f1ed", color: "#15130f" },
  table: { marginTop: 8, borderWidth: 0.75, borderColor: "#e4ddd2" },
  th: { flexDirection: "row", backgroundColor: "#1e4a36", color: "#ffffff", fontWeight: 800 },
  tr: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: "#e4ddd2" },
  cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  cellRight: { flex: 1, paddingVertical: 4, paddingHorizontal: 6, textAlign: "right" },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: "#5b5448" },
});

export function PdfRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={pdf.row} wrap={false}>
      <Text style={pdf.label}>{label}</Text>
      <Text style={pdf.value}>{value}</Text>
    </View>
  );
}

export function PdfHeader({ brand, title, meta }: { brand: string; title: string; meta: string[] }) {
  return (
    <View style={pdf.header}>
      <View>
        <Text style={pdf.brand}>{brand}</Text>
        <Text style={pdf.title}>{title}</Text>
      </View>
      <View style={pdf.meta}>
        {meta.map((line, i) => (
          <Text key={line} style={i === 0 ? pdf.number : undefined}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PdfFooter({ text }: { text: string }) {
  return (
    <View style={pdf.footer} fixed>
      <Text>{text}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function formatPdfDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00Z`) : date;
  return new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeZone: typeof date === "string" ? "UTC" : "America/Panama" }).format(d);
}
