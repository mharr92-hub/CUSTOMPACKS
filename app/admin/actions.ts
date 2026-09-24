"use server";

import { redirect } from "next/navigation";
import { requestStaffMagicLink, signOutCurrentUser } from "@/lib/auth";

export async function signOutAction(): Promise<void> {
  await signOutCurrentUser();
  redirect("/admin/ingresar");
}

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; devLink: string | null }
  | { status: "error"; error: "invalid_email" };

export async function requestLoginLinkAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const result = await requestStaffMagicLink(String(form.get("email") ?? ""), String(form.get("next") ?? "") || null);
  if (!result.ok) return { status: "error", error: result.error };
  return { status: "sent", devLink: result.devLink };
}
