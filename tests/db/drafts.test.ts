import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { closeTestSql, testSql } from "../support/db";

// Fuera de Next no hay caché incremental: el catálogo se lee directo de la base.
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => {}, updateTag: () => {} }));

const { resetServerEnvCache } = await import("@/lib/env");
const { getSql } = await import("@/lib/db/client");
const { claimResumeEmail, purgeExpiredDrafts, saveDraft, RESUME_EMAILS_PER_DAY } = await import("@/lib/quote/drafts");
const { submitDraft } = await import("@/lib/quote/submit");
const { emptyItem, initialWizardState } = await import("@/lib/quote/types");
type WizardState = import("@/lib/quote/types").WizardState;

beforeAll(() => {
  process.env.DATABASE_URL = inject("databaseUrl");
  resetServerEnvCache();
});

afterAll(async () => {
  await getSql().end({ timeout: 5 });
  await closeTestSql();
});

let seq = 0;
/** Solicitud mínima válida: una pieza a sugerencia del equipo. */
function quoteState(contact: Partial<WizardState["contact"]> = {}): WizardState {
  seq += 1;
  const s = initialWizardState();
  s.segment = "commercial";
  s.product.name = `Producto ${seq}`;
  s.items = [{ ...emptyItem("a"), needsAdvice: true, quantities: ["1000", "", ""], frequency: "once" }];
  s.contact = { ...s.contact, name: "Ana Pérez", email: `ana${seq}@example.com`, city: "Panamá", address: "Calle 50", consent: true, ...contact };
  return s;
}

async function submit(state: WizardState) {
  const { token } = await saveDraft(null, state);
  const result = await submitDraft(token, { ip: "127.0.0.1" });
  if (!result.ok) throw new Error(`envío rechazado: ${JSON.stringify(result)}`);
  const [row] = await testSql()<{ company_id: string; ruc: string | null }[]>`select company_id, ruc from public.quote_requests where id = ${result.requestId}`;
  return { ...result, companyId: row?.company_id, ruc: row?.ruc };
}

describe("borradores y privacidad (D-033)", () => {
  it("sin consentimiento el servidor no guarda los datos de contacto", async () => {
    const draft = quoteState({ consent: false, whatsapp: "+507 6123-4567", comments: "Llamar de tarde" });
    const { token } = await saveDraft(null, draft);
    const [row] = await testSql()<{ payload: WizardState; contact_email: string | null; contact_whatsapp: string | null }[]>`
      select payload, contact_email, contact_whatsapp from public.quote_drafts where token = ${token}`;
    expect(row?.contact_email).toBeNull();
    expect(row?.contact_whatsapp).toBeNull();
    expect(row?.payload.contact).toMatchObject({ name: "", email: "", whatsapp: "", address: "", comments: "", consent: false });
    expect(row?.payload.product.name).toBe(draft.product.name);

    await saveDraft(token, { ...draft, contact: { ...draft.contact, consent: true } });
    const [after] = await testSql()<{ contact_email: string | null }[]>`select contact_email from public.quote_drafts where token = ${token}`;
    expect(after?.contact_email).toBe(draft.contact.email);
  });

  it("el enlace «Guardar y seguir después» tiene cupo diario por borrador", async () => {
    const { token } = await saveDraft(null, quoteState());
    for (let i = 0; i < RESUME_EMAILS_PER_DAY; i++) expect(await claimResumeEmail(token)).toBe(true);
    expect(await claimResumeEmail(token)).toBe(false);
    await testSql()`update public.quote_drafts set resume_window_at = now() - interval '25 hours' where token = ${token}`;
    expect(await claimResumeEmail(token)).toBe(true);
  });

  it("el cron borra los borradores vencidos sin enviar y conserva los enviados", async () => {
    const abandoned = await saveDraft(null, quoteState());
    const sent = await submit(quoteState());
    const [sentDraft] = await testSql()<{ token: string }[]>`select d.token from public.quote_drafts d join public.quote_requests r on r.draft_id = d.id where r.id = ${sent.requestId}`;
    await testSql()`update public.quote_drafts set expires_at = now() - interval '1 day' where token in ${testSql()([abandoned.token, sentDraft?.token ?? ""])}`;
    const purged = await purgeExpiredDrafts();
    expect(purged).toContain(abandoned.token);
    expect(purged).not.toContain(sentDraft?.token);
    const left = await testSql()`select 1 from public.quote_drafts where token = ${sentDraft?.token ?? ""}`;
    expect(left).toHaveLength(1);
  });
});

describe("empresa de la solicitud (Empresa 1:N solicitudes)", () => {
  it("mismo RUC (con otro formato) → misma empresa; el RUC se guarda normalizado", async () => {
    const first = await submit(quoteState({ company: "Burgers del Istmo", ruc: "155-1-2026 dv 12" }));
    const second = await submit(quoteState({ company: "Burgers del Istmo S.A.", ruc: " 155-1-2026 DV 12 " }));
    expect(first.ruc).toBe("155-1-2026DV12");
    expect(second.companyId).toBe(first.companyId);
  });

  it("sin RUC, el mismo correo o WhatsApp de una solicitud anterior → misma empresa", async () => {
    const first = await submit(quoteState({ company: "Café Bajareque", email: "compras@bajareque.test" }));
    const byEmail = await submit(quoteState({ company: "Café Bajareque", email: "COMPRAS@bajareque.test" }));
    expect(byEmail.companyId).toBe(first.companyId);
    const other = await submit(quoteState({ company: "Otra", email: "otra@example.com" }));
    expect(other.companyId).not.toBe(first.companyId);
  });

  it("un RUC nuevo no se pega a una empresa que ya tiene otro RUC", async () => {
    const first = await submit(quoteState({ ruc: "8-111-222", email: "misma@example.com" }));
    const second = await submit(quoteState({ ruc: "8-333-444", email: "misma@example.com" }));
    expect(second.companyId).not.toBe(first.companyId);
  });
});
