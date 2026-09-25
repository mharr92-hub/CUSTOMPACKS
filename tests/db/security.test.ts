import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { getPublicCatalog } = await import("@/lib/catalog/public");
const { evaluateCaliber, evaluatePaper } = await import("@/lib/compat");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { allowIp, allowRate, purgeRateLimits, RATE_RULES } = await import("@/lib/rate-limit");

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  delete process.env.RESEND_API_KEY;
  delete process.env.RATE_LIMIT_FACTOR;
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

/** Tablas que el público puede leer a propósito (catálogo activo y settings públicos). */
const PUBLIC_READ = new Set([
  "categories",
  "product_types",
  "standard_sizes",
  "papers",
  "calibers",
  "print_options",
  "finishes",
  "eco_attributes",
  "food_attributes",
  "compatibilities",
  "gallery_samples",
  "settings",
]);

let seq = 0;
async function request(): Promise<{ requestId: string; accessToken: string }> {
  const catalog = await getPublicCatalog();
  const s = initialWizardState();
  s.segment = "commercial";
  s.product = { ...s.product, name: "Jabones", weight: "120", length: "8", width: "6", height: "4" };
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
        quantities: ["800", "", ""],
        frequency: "once",
      },
    ];
    break;
  }
  seq += 1;
  s.contact = { ...s.contact, name: "Ana Díaz", email: `ana-e9-${Date.now()}-${seq}@example.com`, whatsapp: "+507 6111-2222", city: "Panamá", address: "Bella Vista", consent: true };
  const { token } = await saveDraft(null, s);
  const sent = await submitDraft(token, { ip: null });
  if (!sent.ok) throw new Error("envío rechazado");
  return sent;
}

async function publicTables(): Promise<string[]> {
  const rows = await testSql()<{ name: string }[]>`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
  return rows.map((r) => r.name);
}

/** Filas que ve el actor: 0 si RLS o los permisos lo impiden. */
async function visibleRows(actor: Parameters<typeof asActor>[0], table: string): Promise<number> {
  try {
    const [row] = await asActor(actor, (tx) => tx.unsafe<{ n: number }[]>(`select count(*)::int as n from public.${table}`));
    return row?.n ?? 0;
  } catch (error) {
    if (/permission denied/i.test(String(error))) return 0;
    throw error;
  }
}

describe("RLS en todas las tablas (OWASP A01)", () => {
  it("toda tabla del esquema public tiene RLS activado", async () => {
    const rows = await testSql()<{ name: string }[]>`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`;
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("sin enlace, el público no lee ninguna fila fuera del catálogo; con un enlace, solo su solicitud", async () => {
    const a = await request();
    const b = await request();
    const tables = await publicTables();
    expect(tables.length).toBeGreaterThan(30);
    const leaks: string[] = [];
    for (const table of tables.filter((t) => !PUBLIC_READ.has(t))) {
      if ((await visibleRows({ kind: "anon" }, table)) > 0) leaks.push(table);
      if ((await visibleRows({ kind: "anon", accessToken: "z".repeat(43) }, table)) > 0) leaks.push(`${table} (token ajeno)`);
    }
    expect(leaks).toEqual([]);

    // Settings: solo los públicos.
    const [privateSettings] = await asActor({ kind: "anon" }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from public.settings where not is_public`);
    expect(privateSettings?.n).toBe(0);

    // Con el enlace de A: su solicitud y sus piezas, nunca las de B.
    const seen = await asActor({ kind: "anon", accessToken: a.accessToken }, (tx) => tx<{ id: string }[]>`select id from public.quote_requests`);
    expect(seen.map((r) => r.id)).toEqual([a.requestId]);
    const itemsOfB = await asActor({ kind: "anon", accessToken: a.accessToken }, (tx) => tx`select 1 from public.quote_items where request_id = ${b.requestId}`);
    expect(itemsOfB).toHaveLength(0);
    const logOfB = await asActor({ kind: "anon", accessToken: a.accessToken }, (tx) => tx`select 1 from public.quote_request_status_log where request_id = ${b.requestId}`);
    expect(logOfB).toHaveLength(0);
    // Ni con el enlace se leen columnas internas.
    await expect(asActor({ kind: "anon", accessToken: a.accessToken }, (tx) => tx`select assigned_to from public.quote_requests`)).rejects.toThrow(/permission denied/);
  });

  it("una cuenta sin rol del equipo no ve solicitudes, y el público no escribe", async () => {
    await request();
    const client = await createUser(`cliente-e9-${Date.now()}@test.local`, "client");
    for (const table of ["quote_requests", "quote_items", "orders", "payments", "notifications", "activities", "audit_log", "profiles", "quotes", "factory_rfqs"]) {
      const n = await visibleRows({ kind: "user", userId: client }, table);
      // profiles: cada quien ve solo su perfil.
      expect(n, table).toBeLessThanOrEqual(table === "profiles" ? 1 : 0);
    }
    const token = "x".repeat(40);
    await expect(
      asActor(
        { kind: "anon" },
        (tx) => tx`
          insert into public.quote_requests (number, access_token, traffic_light, segment, contact_name, contact_email, consent_at)
          values ('S-2026-99999', ${token}, 'green', 'commercial', 'X', 'x@x.com', now())`,
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
    await expect(asActor({ kind: "anon" }, (tx) => tx`update public.settings set description = 'x' where is_public`)).rejects.toThrow(/permission denied|row-level security/);
    await expect(asActor({ kind: "anon" }, (tx) => tx`delete from public.gallery_samples`)).rejects.toThrow(/permission denied|row-level security/);
  });
});

describe("límite de intentos (OWASP A04/A07)", () => {
  it("corta al pasar el máximo de la ventana, guarda el identificador con hash y nadie más usa la tabla", async () => {
    const email = `victima-${Date.now()}@example.com`;
    const results: boolean[] = [];
    for (let i = 0; i < RATE_RULES.loginEmail.limit + 2; i++) results.push(await allowRate("loginEmail", email));
    expect(results.filter(Boolean)).toHaveLength(RATE_RULES.loginEmail.limit);
    expect(results.at(-1)).toBe(false);
    // Otro correo no se ve afectado.
    expect(await allowRate("loginEmail", `otro-${Date.now()}@example.com`)).toBe(true);
    // La IP sale de la cabecera de la plataforma.
    expect(await allowIp("submit")).toBe(true);
    const raw = await testSql()<{ key: string }[]>`select key from public.rate_limits where key like 'loginEmail:%' or key like 'submit:%'`;
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.some((r) => r.key.includes(email) || r.key.includes("198.51.100.7"))).toBe(false);
    await expect(asActor({ kind: "anon" }, (tx) => tx`select * from public.rate_limits`)).rejects.toThrow(/permission denied/);
    await expect(asActor({ kind: "anon" }, (tx) => tx`select public.rate_limit_hit('x', 60, 1)`)).rejects.toThrow(/permission denied/);
    // Limpieza de ventanas viejas.
    await testSql()`insert into public.rate_limits (key, window_start, hits) values ('viejo:x', now() - interval '3 days', 1)`;
    expect(await purgeRateLimits()).toBeGreaterThanOrEqual(1);
  });
});
