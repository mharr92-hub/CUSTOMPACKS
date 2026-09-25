import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { getPublicCatalog } = await import("@/lib/catalog/public");
const { evaluateCaliber, evaluatePaper } = await import("@/lib/compat");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { changeRequestStatus } = await import("@/lib/panel/requests");
const { getReports, resolveRange } = await import("@/lib/panel/reports");
const { toCsv } = await import("@/lib/csv");
const { todayInPanama } = await import("@/lib/leadtime");
type CurrentUser = import("@/lib/auth").CurrentUser;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  delete process.env.RESEND_API_KEY;
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

let seq = 0;
async function request(utm: Record<string, string>, leadSource: string) {
  const catalog = await getPublicCatalog();
  const s = initialWizardState();
  s.segment = "commercial";
  s.product = { ...s.product, name: "Velas", weight: "300", length: "10", width: "10", height: "12" };
  let typeCode = "";
  for (const type of catalog.productTypes.filter((t) => t.segments.includes("commercial"))) {
    const size = catalog.sizes.find((z) => z.family === type.sizeFamily);
    const paper = catalog.papers.find((p) => evaluatePaper(catalog.compatibilities, type.id, p.id).allowed);
    const caliber = paper && catalog.calibers.find((c) => evaluateCaliber(catalog.compatibilities, type.id, paper.id, c.id).allowed);
    const noPrint = catalog.printOptions.find((p) => p.isNoPrint);
    if (!size || !paper || !caliber || !noPrint) continue;
    s.items = [
      {
        ...emptyItem("a"),
        productTypeId: type.id,
        categoryId: type.categoryId,
        sizeMode: "standard",
        standardSizeId: size.id,
        paperId: paper.id,
        caliberId: caliber.id,
        printOptionId: noPrint.id,
        quantities: ["500", "", ""],
        frequency: "once",
      },
    ];
    typeCode = type.code;
    break;
  }
  seq += 1;
  s.contact = { ...s.contact, name: "Luis Pérez", email: `luis-e9-${Date.now()}-${seq}@example.com`, whatsapp: "+507 6000-0000", city: "Panamá", address: "Calle 50", source: leadSource as "other", consent: true };
  s.utm = utm;
  const { token } = await saveDraft(null, s);
  const sent = await submitDraft(token, { ip: null });
  if (!sent.ok) throw new Error(`envío rechazado: ${JSON.stringify(sent)}`);
  return { ...sent, typeCode };
}

describe("reportes del panel", () => {
  it("el período por defecto son 90 días hasta hoy y no acepta fechas futuras ni invertidas", () => {
    expect(resolveRange({}, "2026-09-24")).toEqual({ from: "2026-06-27", to: "2026-09-24" });
    expect(resolveRange({ from: "2026-09-30", to: "2026-12-01" }, "2026-09-24")).toEqual({ from: "2026-06-27", to: "2026-09-24" });
    expect(resolveRange({ from: "2026-09-01", to: "2026-09-10" }, "2026-09-24")).toEqual({ from: "2026-09-01", to: "2026-09-10" });
  });

  it("pipeline, tiempos, conversión, tipos y canales salen de las solicitudes del período; el CSV respeta las columnas", async () => {
    const id = await createUser(`reportes-${Date.now()}@test.local`, "viewer");
    const viewer: CurrentUser = { userId: id, email: null, profileId: id, name: null, role: "viewer", isActive: true };
    const salesId = await createUser(`reportes-v-${Date.now()}@test.local`, "sales");
    const sales: CurrentUser = { userId: salesId, email: null, profileId: salesId, name: null, role: "sales", isActive: true };
    const range = resolveRange({});
    const before = await getReports(viewer, range);
    const count = (tables: typeof before, key: string, label: string, col = 1) =>
      Number(tables.find((t) => t.key === key)?.rows.find((r) => r[0] === label)?.[col] ?? 0);

    const a = await request({ utm_source: "Instagram", utm_medium: "paid" }, "social");
    await request({}, "referral");
    await testSql()`update public.quote_requests set submitted_at = now() - interval '5 hours' where id = ${a.requestId}`;
    expect(await changeRequestStatus(sales, a.requestId, "in_review")).toEqual({ ok: true });

    const after = await getReports(viewer, range);
    expect(after.map((t) => t.key)).toEqual(["pipeline", "requestTimes", "orderTimes", "conversion", "types", "materials", "losses", "ordersDue", "channels"]);
    expect(count(after, "pipeline", "En revisión") - count(before, "pipeline", "En revisión")).toBe(1);
    expect(count(after, "pipeline", "Enviada") - count(before, "pipeline", "Enviada")).toBe(1);
    const first = after.find((t) => t.key === "requestTimes")!.rows[0]!;
    expect(first[0]).toBe("Enviada → En revisión");
    expect(Number(first[1])).toBeGreaterThanOrEqual(1);
    expect(Number(first[2])).toBeGreaterThan(0);
    expect(count(after, "conversion", "Comercio") - count(before, "conversion", "Comercio")).toBe(2);
    const types = after.find((t) => t.key === "types")!;
    expect(types.rows.some((r) => r[0] === a.typeCode)).toBe(true);
    expect(count(after, "channels", "instagram", 2) - count(before, "channels", "instagram", 2)).toBe(1);
    expect(after.find((t) => t.key === "channels")!.rows.find((r) => r[0] === "instagram")?.[1]).toBe("paid");
    expect(count(after, "channels", "Me lo recomendaron", 2) - count(before, "channels", "Me lo recomendaron", 2)).toBe(1);

    // Fuera del período no cuenta.
    const past = await getReports(viewer, { from: "2020-01-01", to: "2020-01-31" }, "pipeline");
    expect(past[0]!.rows.every((r) => r[1] === 0)).toBe(true);

    const csv = toCsv(types.columns.map((c) => c.label), types.rows);
    expect(csv.slice(1).split("\r\n")[0]).toBe("Código,Tipo,Piezas,Piezas aceptadas");
    expect(todayInPanama()).toBe(range.to);
  });
});
