"use server";

import { cookies, headers } from "next/headers";
import { brand } from "@/config/brand";
import { serverT } from "@/lib/i18n";
import { log } from "@/lib/log";
import { kickNotifications } from "@/lib/notify";
import { htmlParagraph, sendEmail } from "@/lib/mail";
import { claimResumeEmail, isDraftToken, loadDraft, saveDraft } from "@/lib/quote/drafts";
import { CONFIRMATION_COOKIE, resumeLink } from "@/lib/quote/links";
import { parseWizardState } from "@/lib/quote/schema";
import { submitDraft } from "@/lib/quote/submit";
import type { StepId, WizardState } from "@/lib/quote/types";
import { isValidEmail, type StepErrors } from "@/lib/quote/validate";
import { verifyCaptcha } from "@/lib/captcha";
import { allowIp, requestIp } from "@/lib/rate-limit";

export type SaveResult = { ok: true; token: string } | { ok: false; submitted?: boolean };

/** Autoguardado del borrador (la verdad del progreso vive en quote_drafts). */
export async function saveDraftAction(token: string | null, payload: unknown): Promise<SaveResult> {
  const state = parseWizardState(payload);
  if (!state) return { ok: false };
  if (!(await allowIp("draft"))) return { ok: false };
  try {
    const result = await saveDraft(isDraftToken(token) ? token : null, state);
    if (result.status === "submitted") return { ok: false, submitted: true };
    return { ok: true, token: result.token };
  } catch (error) {
    log.error("no se pudo guardar el borrador", { error });
    return { ok: false };
  }
}

export type LoadResult = { status: "ok"; state: WizardState; submitted: boolean } | { status: "missing" } | { status: "error" };

export async function loadDraftAction(token: string): Promise<LoadResult> {
  try {
    const draft = await loadDraft(token);
    return draft ? { status: "ok", state: draft.state, submitted: draft.submittedRequestId !== null } : { status: "missing" };
  } catch (error) {
    log.error("no se pudo leer el borrador", { error });
    return { status: "error" };
  }
}

export type ResumeResult = { ok: true } | { ok: false; reason: "invalid" | "limit" | "failed" };

/** "Guardar y seguir después": envía el enlace del borrador por correo (máximo 3 por día y borrador). */
export async function sendResumeLinkAction(token: string, email: string): Promise<ResumeResult> {
  if (!isValidEmail(email)) return { ok: false, reason: "invalid" };
  if (!isDraftToken(token)) return { ok: false, reason: "failed" };
  try {
    if (!(await allowIp("resume"))) return { ok: false, reason: "limit" };
    if (!(await claimResumeEmail(token))) return { ok: false, reason: "limit" };
    const t = serverT("wizard");
    const link = resumeLink(token);
    const values = { brand: brand.name };
    const result = await sendEmail({
      to: email.trim(),
      subject: t("resumeEmailSubject", values),
      text: t("resumeEmailText", { ...values, link }),
      html: htmlParagraph((v) => t("resumeEmailText", v), values, link),
    });
    return result.status === "failed" ? { ok: false, reason: "failed" } : { ok: true };
  } catch (error) {
    log.error("no se pudo enviar el enlace del borrador", { error });
    return { ok: false, reason: "failed" };
  }
}

export type SubmitActionResult =
  | { ok: true; number: string }
  | { ok: false; reason: "not_found" | "error" | "rate_limited" | "captcha" }
  | { ok: false; reason: "invalid"; step: StepId; item: number; errors: StepErrors };

/**
 * Envía la solicitud. El enlace de seguimiento (token de acceso) viaja en una
 * cookie httpOnly hacia /cotizar/listo y nunca en la URL: así no llega a GA4 ni
 * al Pixel de Meta.
 */
export async function submitQuoteAction(token: string, captchaToken?: string | null): Promise<SubmitActionResult> {
  if (!isDraftToken(token)) return { ok: false, reason: "not_found" };
  if (!(await allowIp("submit"))) return { ok: false, reason: "rate_limited" };
  if (!(await verifyCaptcha(typeof captchaToken === "string" ? captchaToken : null, await requestIp()))) return { ok: false, reason: "captcha" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  try {
    const result = await submitDraft(token, { ip });
    if (!result.ok) return result;
    (await cookies()).set(CONFIRMATION_COOKIE, result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/cotizar/listo",
      maxAge: 60 * 60 * 24,
    });
    // La base encoló "Solicitud recibida" (cliente y equipo): se envía al terminar la respuesta.
    if (!result.alreadySubmitted) kickNotifications();
    return { ok: true, number: result.number };
  } catch (error) {
    log.error("no se pudo enviar la solicitud", { error });
    return { ok: false, reason: "error" };
  }
}
