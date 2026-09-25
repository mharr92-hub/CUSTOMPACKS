import "server-only";
import { serviceActor, withActor } from "@/lib/db/actor";
import { randomToken } from "@/lib/tokens";
import { parseWizardState } from "./schema";
import { emptyContact, type WizardState } from "./types";

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
 * Datos de contacto que se guardan en el servidor: solo con el consentimiento
 * del paso 8 marcado (Ley 81 de 2019). Antes quedan únicamente en el
 * dispositivo de la persona (localStorage).
 */
export function stateForServer(state: WizardState): WizardState {
  if (state.contact.consent) return state;
  return { ...state, contact: { ...emptyContact(), source: state.contact.source } };
}

/**
 * Crea o actualiza un borrador. Sin token (o con uno vencido o inexistente)
 * crea uno nuevo. Un borrador ya enviado no se modifica ni se reemplaza.
 */
export type SaveDraftResult = { status: "saved" | "created"; token: string } | { status: "submitted"; token: string };

export async function saveDraft(token: string | null, input: WizardState): Promise<SaveDraftResult> {
  const state = stateForServer(input);
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

/** Máximo de correos "Guardar y seguir después" por borrador en 24 h. */
export const RESUME_EMAILS_PER_DAY = 3;

/**
 * Reserva un envío del enlace de reanudación (atómico): false si el borrador no
 * existe, ya se envió o agotó el cupo del día. Evita usar el cotizador como
 * relé de correos de la marca.
 */
export async function claimResumeEmail(token: string): Promise<boolean> {
  if (!isDraftToken(token)) return false;
  const rows = await withActor({ kind: "anon", accessToken: token }, (tx) => tx`
    update public.quote_drafts
       set resume_sent_count = case when resume_window_at is null or resume_window_at < now() - interval '24 hours' then 1 else resume_sent_count + 1 end,
           resume_window_at = case when resume_window_at is null or resume_window_at < now() - interval '24 hours' then now() else resume_window_at end
     where token = ${token}
       and submitted_request_id is null
       and (resume_window_at is null or resume_window_at < now() - interval '24 hours' or resume_sent_count < ${RESUME_EMAILS_PER_DAY})
     returning id`);
  return rows.length > 0;
}

/**
 * Borra los borradores vencidos que nunca se enviaron (cron diario). Devuelve
 * sus tokens para limpiar también los archivos subidos a esos borradores.
 */
export async function purgeExpiredDrafts(): Promise<string[]> {
  const rows = await withActor(serviceActor, (tx) => tx<{ token: string }[]>`
    delete from public.quote_drafts
     where expires_at < now() and submitted_request_id is null
     returning token`);
  return rows.map((r) => r.token);
}
