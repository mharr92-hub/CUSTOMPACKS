"use server";

import { redirect } from "next/navigation";
import { requestStaffMagicLink, signOutCurrentUser } from "@/lib/auth";
import { allowIp, allowRate } from "@/lib/rate-limit";

export async function signOutAction(): Promise<void> {
  await signOutCurrentUser();
  redirect("/admin/ingresar");
}

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; devLink: string | null }
  | { status: "error"; error: "invalid_email" | "rate_limited" };

export async function requestLoginLinkAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  // Tope por IP y por correo: evita bombardear un buzón con enlaces.
  const email = String(form.get("email") ?? "").slice(0, 320);
  if (!(await allowIp("login")) || !(await allowRate("loginEmail", email))) return { status: "error", error: "rate_limited" };
  const result = await requestStaffMagicLink(String(form.get("email") ?? ""), String(form.get("next") ?? "") || null);
  if (!result.ok) return { status: "error", error: result.error };
  return { status: "sent", devLink: result.devLink };
}
