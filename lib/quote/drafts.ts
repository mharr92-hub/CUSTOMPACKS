import "server-only";
import { withActor } from "@/lib/db/actor";
import { randomToken } from "@/lib/tokens";
import { parseWizardState } from "./schema";
import type { WizardState } from "./types";

/**
 * Borradores del cotizador en quote_drafts. Se leen y escriben como `anon` con
 * el token en app.access_token: RLS impide ver o tocar borradores ajenos.
 */
export type DraftRecord = { token: string; state: WizardState; submittedRequestId: string | null; expiresAt: Date };

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function isDraftToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export async function loadDraft(token: string): Promise<DraftRecord | null> {
  if (!isDraftToken(token)) return null;
  const rows = await withActor({ kind: "anon", accessToken: token }, (tx) => tx<{ payload: unknown; submitted_request_id: string | null; expires_at: Date }[]>`
    select payload, submitted_request_id, expires_at from public.quote_drafts where token = ${token}`);
  const row = rows[0];
  if (!row) return null;
  const state = parseWizardState(row.payload);
  if (!state) return null;
  return { token, state, submittedRequestId: row.submitted_request_id, expiresAt: row.expires_at };
}

/**
 * Crea o actualiza un borrador. Sin token (o con uno vencido o inexistente)
 * crea uno nuevo. Un borrador ya enviado no se modifica ni se reemplaza.
 */
export type SaveDraftResult = { status: "saved" | "created"; token: string } | { status: "submitted"; token: string };

export async function saveDraft(token: string | null, state: WizardState): Promise<SaveDraftResult> {
  const email = state.contact.email.trim() || null;
  const whatsapp = state.contact.whatsapp.trim() || null;
  if (token && isDraftToken(token)) {
    const updated = await withActor({ kind: "anon", accessToken: token }, (tx) => tx`
      update public.quote_drafts
         set payload = ${tx.json(state as never)}, step = ${state.step}, contact_email = ${email}, contact_whatsapp = ${whatsapp},
             expires_at = now() + interval '30 days'
       where token = ${token} and submitted_request_id is null
       returning id`);
    if (updated.length > 0) return { status: "saved", token };
    const existing = await withActor({ kind: "anon", accessToken: token }, (tx) => tx`
      select submitted_request_id from public.quote_drafts where token = ${token}`);
    if (existing[0]?.submitted_request_id) return { status: "submitted", token };
  }
  const fresh = randomToken(32);
  await withActor({ kind: "anon", accessToken: fresh }, (tx) => tx`
    insert into public.quote_drafts (token, payload, step, contact_email, contact_whatsapp)
    values (${fresh}, ${tx.json(state as never)}, ${state.step}, ${email}, ${whatsapp})`);
  return { status: "created", token: fresh };
}
