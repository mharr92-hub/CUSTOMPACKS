import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, createUser, testSql } from "../support/db";

// Fuera de Next no hay caché incremental: el catálogo se lee directo de la base.
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { getPublicCatalog } = await import("@/lib/catalog/public");
const { evaluateCaliber, evaluatePaper } = await import("@/lib/compat");
const { saveDraft } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { approveProof } = await import("@/lib/artwork/client-portal");
const { confirmArtworkDeletion, flagExpiredArtwork, listFlaggedArtwork } = await import("@/lib/artwork/retention");
type WizardState = import("@/lib/quote/types").WizardState;
type CurrentUser = import("@/lib/auth").CurrentUser;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

/** Pieza impresa válida armada con el catálogo sembrado (tipo, tamaño, papel y calibre compatibles). */
async function printedState(): Promise<WizardState> {
  const catalog = await getPublicCatalog();
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = "Cajas de regalo";
  for (const type of catalog.productTypes.filter((t) => t.segments.includes("commercial"))) {
    const size = catalog.sizes.find((z) => z.family === type.sizeFamily);
    const paper = catalog.papers.find((p) => evaluatePaper(catalog.compatibilities, type.id, p.id).allowed);
    const caliber = paper && catalog.calibers.find((c) => evaluateCaliber(catalog.compatibilities, type.id, paper.id, c.id).allowed);
    const print = catalog.printOptions.find((p) => !p.isNoPrint && !p.requiresPantone);
    if (!size || !paper || !caliber || !print) continue;
    s.items = [
      {
        ...emptyItem("pieza1"),
        productTypeId: type.id,
        categoryId: type.categoryId,
        sizeMode: "standard",
        standardSizeId: size.id,
        paperId: paper.id,
        caliberId: caliber.id,
        printOptionId: print.id,
        faces: "outside",
        coverage: "logo",
        quantities: ["1000", "", ""],
        frequency: "once",
        artwork: "has_artwork",
      },
    ];
    break;
  }
  s.contact = { ...s.contact, name: "Ana Pérez", email: "ana.arte@example.com", city: "Panamá", address: "Calle 50", consent: true };
  return s;
}

describe("envío con archivos del paso 7", () => {
  it("solo registra los archivos que el servidor verificó al subirlos", async () => {
    const base = await printedState();
    const { token } = await saveDraft(null, base);
    const [draft] = await testSql()<{ id: string }[]>`select id from public.quote_drafts where token = ${token}`;
    const okPath = `drafts/${token}/pieza1/artwork/n1-arte.pdf`;
    const okPhoto = `drafts/${token}/pieza1/reference/n2-foto.jpg`;
    await testSql()`
      insert into public.quote_draft_files (draft_id, item_key, purpose, storage_path, file_name, format, size_bytes) values
        (${draft!.id}, 'pieza1', 'artwork', ${okPath}, 'arte.pdf', 'pdf', 2048),
        (${draft!.id}, 'pieza1', 'reference', ${okPhoto}, 'foto.jpg', 'jpeg', 1024)`;
    const forged = `requests/00000000-0000-0000-0000-000000000000/x/artwork/n9-ajeno.pdf`;
    const state: WizardState = {
      ...base,
      items: [
        {
          ...base.items[0]!,
          artworkFiles: [
            { id: "n1", name: "arte.pdf", size: 2048, path: okPath, kind: "pdf" },
            { id: "n9", name: "ajeno.pdf", size: 10, path: forged, kind: "pdf" },
          ],
          referencePhotos: [{ id: "n2", name: "foto.jpg", size: 1024, path: okPhoto, kind: "jpeg" }],
        },
      ],
    };
    await saveDraft(token, state);
    const result = await submitDraft(token, { ip: "127.0.0.1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const files = await testSql()<{ storage_path: string; version: number; status: string }[]>`
      select storage_path, version, status from public.artwork_files where request_id = ${result.requestId}`;
    expect(files).toEqual([{ storage_path: okPath, version: 1, status: "received" }]);
    const photos = await testSql()<{ storage_path: string }[]>`
      select r.storage_path from public.quote_references r join public.quote_items i on i.id = r.item_id
       where i.request_id = ${result.requestId} and r.kind = 'photo'`;
    expect(photos.map((p) => p.storage_path)).toEqual([okPhoto]);
    const [req] = await testSql()<{ traffic_light: string; missing_fields: string[] }[]>`select traffic_light, missing_fields from public.quote_requests where id = ${result.requestId}`;
    expect(req?.missing_fields).not.toContain("1:artwork");
  });
});

describe("aprobación del proof desde el portal", () => {
  it("registra nombre, IP y navegador; un segundo clic no cambia la aprobación", async () => {
    const sql = testSql();
    const base = await printedState();
    const { token } = await saveDraft(null, base);
    const sent = await submitDraft(token, { ip: null });
    if (!sent.ok) throw new Error("envío rechazado");
    const [item] = await sql<{ id: string }[]>`select id from public.quote_items where request_id = ${sent.requestId}`;
    const [proof] = await sql<{ id: string }[]>`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
      values (${item!.id}, ${sent.requestId}, 'proof', 1, ${`requests/${sent.requestId}/${item!.id}/proof/p1-proof.pdf`}, 'proof.pdf', 'pdf', 500, 'proof_sent', false)
      returning id`;
    expect(await approveProof(sent.accessToken, proof!.id, { name: "  ", ip: null, userAgent: null })).toEqual({ ok: false, error: "name" });
    const first = await approveProof(sent.accessToken, proof!.id, { name: "Ana Pérez", ip: "203.0.113.9", userAgent: "Mozilla/5.0" });
    expect(first.ok).toBe(true);
    const second = await approveProof(sent.accessToken, proof!.id, { name: "Otra persona", ip: "198.51.100.1", userAgent: "x" });
    expect(second).toEqual({ ok: false, error: "not_pending" });
    expect(await approveProof("x".repeat(40), proof!.id, { name: "Ana Pérez", ip: null, userAgent: null })).toEqual({ ok: false, error: "not_found" });
    const [row] = await sql<{ approved_by_name: string; ip: string; user_agent: string; approved_by_email: string }[]>`
      select approved_by_name, ip, user_agent, approved_by_email from public.artwork_approvals where artwork_file_id = ${proof!.id}`;
    expect(row).toEqual({ approved_by_name: "Ana Pérez", ip: "203.0.113.9", user_agent: "Mozilla/5.0", approved_by_email: "ana.arte@example.com" });
  });
});

describe("retención del arte", () => {
  it("el cron marca lo vencido sin borrar; solo admin confirma el borrado", async () => {
    const sql = testSql();
    const base = await printedState();
    const { token } = await saveDraft(null, base);
    const sent = await submitDraft(token, { ip: null });
    if (!sent.ok) throw new Error("envío rechazado");
    const [item] = await sql<{ id: string }[]>`select id from public.quote_items where request_id = ${sent.requestId}`;
    const [old] = await sql<{ id: string }[]>`
      insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, created_at)
      values (${item!.id}, ${sent.requestId}, 'artwork', 1, ${`requests/${sent.requestId}/${item!.id}/artwork/v1-viejo.pdf`}, 'viejo.pdf', 'pdf', 100, now() - interval '3 years')
      returning id`;
    await sql`update public.quote_requests set submitted_at = now() - interval '3 years', status_changed_at = now() - interval '3 years' where id = ${sent.requestId}`;

    await flagExpiredArtwork();
    const [flagged] = await sql<{ retention_flagged_at: Date | null; deleted_at: Date | null }[]>`select retention_flagged_at, deleted_at from public.artwork_files where id = ${old!.id}`;
    expect(flagged?.retention_flagged_at).toBeInstanceOf(Date);
    expect(flagged?.deleted_at).toBeNull();

    const adminId = await createUser(`admin-ret-${Date.now()}@test.local`, "admin");
    const salesId = await createUser(`sales-ret-${Date.now()}@test.local`, "sales");
    const asUser = (userId: string, role: "admin" | "sales"): CurrentUser => ({ userId, email: null, profileId: userId, name: null, role, isActive: true });
    expect(await listFlaggedArtwork(asUser(salesId, "sales"))).toEqual([]);
    expect((await listFlaggedArtwork(asUser(adminId, "admin"))).map((f) => f.id)).toContain(old!.id);
    expect(await confirmArtworkDeletion(asUser(salesId, "sales"), [old!.id])).toBe(0);
    expect(await confirmArtworkDeletion(asUser(adminId, "admin"), [old!.id])).toBe(1);
    const [gone] = await sql<{ deleted_at: Date | null; deleted_by: string | null }[]>`select deleted_at, deleted_by from public.artwork_files where id = ${old!.id}`;
    expect(gone?.deleted_at).toBeInstanceOf(Date);
    expect(gone?.deleted_by).toBe(adminId);
  });
});
