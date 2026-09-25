"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/mail";
import { isDraftToken, loadDraft, saveDraft } from "@/lib/quote/drafts";
import { resumeLink } from "@/lib/quote/links";
import { parseWizardState } from "@/lib/quote/schema";
import { submitDraft } from "@/lib/quote/submit";
import type { StepId, WizardState } from "@/lib/quote/types";
import { isValidEmail, type StepErrors } from "@/lib/quote/validate";
import { absoluteUrl } from "@/lib/urls";

export type SaveResult = { ok: true; token: string } | { ok: false; submitted?: boolean };

/** Autoguardado del borrador (la verdad del progreso vive en quote_drafts). */
export async function saveDraftAction(token: string | null, payload: unknown): Promise<SaveResult> {
  const state = parseWizardState(payload);
  if (!state) return { ok: false };
  try {
    const result = await saveDraft(isDraftToken(token) ? token : null, state);
    if (result.status === "submitted") return { ok: false, submitted: true };
    return { ok: true, token: result.token };
  } catch (error) {
    log.error("no se pudo guardar el borrador", { error });
    return { ok: false };
  }
}

export async function loadDraftAction(token: string): Promise<{ state: WizardState; submitted: boolean } | null> {
  const draft = await loadDraft(token);
  return draft ? { state: draft.state, submitted: draft.submittedRequestId !== null } : null;
}

/** "Guardar y seguir después": envía el enlace del borrador por correo. */
export async function sendResumeLinkAction(token: string, email: string): Promise<{ ok: boolean }> {
  if (!isDraftToken(token) || !isValidEmail(email)) return { ok: false };
  const draft = await loadDraft(token);
  if (!draft) return { ok: false };
  const t = serverT("wizard");
  const link = resumeLink(token);
  const result = await sendEmail({
    to: email.trim(),
    subject: t("resumeEmailSubject", { brand: brand.name }),
    text: t("resumeEmailText", { brand: brand.name, link }),
    html: `<p>${t("resumeEmailText", { brand: brand.name, link: `<a href="${link}">${link}</a>` })}</p>`,
  });
  return { ok: result.status !== "failed" };
}

export type SubmitActionResult =
  | { ok: true; number: string; accessToken: string }
  | { ok: false; reason: "not_found" | "error" }
  | { ok: false; reason: "invalid"; step: StepId; item: number; errors: StepErrors };

export async function submitQuoteAction(token: string): Promise<SubmitActionResult> {
  if (!isDraftToken(token)) return { ok: false, reason: "not_found" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  try {
    const result = await submitDraft(token, { ip });
    if (!result.ok) return result;
    if (!result.alreadySubmitted) {
      const { number, accessToken, specs, state } = result;
      after(async () => {
        const email = state.contact.email.trim();
        if (!email) return;
        const t = serverT("confirmation");
        const link = absoluteUrl(`/seguimiento/${accessToken}`);
        const pieces = specs.map((s) => s.type?.name ?? "").filter(Boolean).join(", ") || number;
        const values = { name: state.contact.name.trim(), number, pieces, link };
        await sendEmail({
          to: email,
          subject: t("emailSubject", { number }),
          text: t("emailText", values),
          html: `<p>${t("emailText", { ...values, link: `<a href="${link}">${link}</a>` })}</p>`,
        });
      });
    }
    return { ok: true, number: result.number, accessToken: result.accessToken };
  } catch (error) {
    log.error("no se pudo enviar la solicitud", { error });
    return { ok: false, reason: "error" };
  }
}
