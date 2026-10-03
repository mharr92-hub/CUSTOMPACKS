import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, testSql } from "../support/db";

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { saveDraft } = await import("@/lib/quote/drafts");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
const { prepareUpload, purgeUnconfirmedUploads } = await import("@/lib/artwork/uploads");

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), `provenpack-storage-${process.pid}`);
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

async function draft() {
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = "Velas";
  s.items = [{ ...emptyItem("pieza1"), needsAdvice: true, quantities: ["500", "", ""], frequency: "once" }];
  const { token } = await saveDraft(null, s);
  const [d] = await testSql()<{ id: string }[]>`select id from public.quote_drafts where token = ${token}`;
  return { token, draftId: d!.id };
}

describe("abuso anónimo del cotizador (M15)", () => {
  it("cada URL de subida queda registrada; las no confirmadas tienen tope y se borran a las 24 horas", async () => {
    const d = await draft();
    const scope = { scope: "draft" as const, draftToken: d.token, itemKey: "pieza1", purpose: "reference" as const };
    const slot = await prepareUpload(scope, { name: "foto.jpg", size: 1000 });
    expect(slot.ok).toBe(true);
    if (!slot.ok) return;
    const [row] = await testSql()<{ draft_id: string; confirmed_at: Date | null }[]>`select draft_id, confirmed_at from public.upload_slots where storage_path = ${slot.path}`;
    expect(row).toEqual({ draft_id: d.draftId, confirmed_at: null });

    // Tope de URLs pendientes por borrador.
    await testSql()`
      insert into public.upload_slots (bucket, storage_path, draft_id)
      select 'artwork', 'drafts/x/' || g, ${d.draftId} from generate_series(1, 40) g`;
    expect(await prepareUpload(scope, { name: "otra.jpg", size: 1000 })).toEqual({ ok: false, error: "tooMany" });

    // Pasadas 24 horas sin confirmar, la purga las borra.
    await testSql()`update public.upload_slots set created_at = now() - interval '25 hours' where draft_id = ${d.draftId}`;
    expect(await purgeUnconfirmedUploads()).toBeGreaterThanOrEqual(41);
    expect(await testSql()`select 1 from public.upload_slots where draft_id = ${d.draftId}`).toHaveLength(0);
  });

  it("el rol de admin del correo configurado exige el correo confirmado (Supabase)", async () => {
    const rows = await testSql()<{ a: boolean; b: boolean; c: boolean }[]>`
      select public.email_confirmed('{"email_confirmed_at": null}'::jsonb) as a,
             public.email_confirmed('{"email_confirmed_at": "2026-10-03T12:00:00Z"}'::jsonb) as b,
             public.email_confirmed('{}'::jsonb) as c`;
    // a: cuenta de Supabase sin confirmar; b: confirmada; c: base local (sin confirmación).
    expect(rows[0]).toEqual({ a: false, b: true, c: true });
  });

  it("las instrucciones de pago ya no son públicas", async () => {
    const [s] = await testSql()<{ is_public: boolean }[]>`select is_public from public.settings where key = 'payment_instructions'`;
    expect(s?.is_public).toBe(false);
  });
});
