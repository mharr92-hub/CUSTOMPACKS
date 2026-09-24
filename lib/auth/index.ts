import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { brand } from "@/config/brand";
import { serviceActor, withActor, type Actor } from "@/lib/db/actor";
import { getServerEnv } from "@/lib/env";
import { serverT } from "@/lib/i18n";
import { log } from "@/lib/log";
import { sendEmail } from "@/lib/mail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomToken, sha256Hex } from "@/lib/tokens";
import { absoluteUrl, safeNextPath } from "@/lib/urls";
import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_MAX_AGE, signLocalSession, verifyLocalSession } from "./local-session";

export type AppRole = "admin" | "sales" | "ops" | "viewer" | "client";
export const STAFF_ROLES: readonly AppRole[] = ["admin", "sales", "ops", "viewer"];
export const EDITOR_ROLES: readonly AppRole[] = ["admin", "sales", "ops"];

export type SessionUser = { userId: string; email: string | null };
export type CurrentUser = SessionUser & {
  profileId: string;
  name: string | null;
  role: AppRole;
  isActive: boolean;
};

const MAGIC_LINK_TTL_MINUTES = 60;

/** Usuario autenticado de la petición (Supabase Auth o sesión local). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    return data.user ? { userId: data.user.id, email: data.user.email ?? null } : null;
  }
  const store = await cookies();
  return verifyLocalSession(store.get(LOCAL_SESSION_COOKIE)?.value);
});

export function actorFor(user: SessionUser): Actor {
  return { kind: "user", userId: user.userId, email: user.email };
}

/** Usuario + perfil (rol). null si no hay sesión o no hay perfil. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSessionUser();
  if (!session) return null;
  const rows = await withActor(actorFor(session), (tx) => tx<{ id: string; name: string | null; role: AppRole; is_active: boolean }[]>`
    select id, name, role, is_active from public.profiles where user_id = ${session.userId}`);
  const profile = rows[0];
  if (!profile) return null;
  return { ...session, profileId: profile.id, name: profile.name, role: profile.role, isActive: profile.is_active };
});

export function isStaffRole(role: AppRole): boolean {
  return STAFF_ROLES.includes(role);
}

/**
 * Exige un usuario del equipo activo (y opcionalmente ciertos roles). Sin
 * sesión redirige al login; con un rol insuficiente, a /admin/sin-acceso.
 * Usarlo en layouts, páginas y en cada Server Action del panel.
 */
export async function requireStaff(roles: readonly AppRole[] = STAFF_ROLES, next = "/admin"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/admin/ingresar?next=${encodeURIComponent(next)}`);
  if (!user.isActive || !isStaffRole(user.role) || !roles.includes(user.role)) redirect("/admin/sin-acceso");
  return user;
}

/** Variante para Server Actions: lanza en lugar de redirigir cuando falta permiso. */
export async function assertStaff(roles: readonly AppRole[] = STAFF_ROLES): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !roles.includes(user.role)) throw new Error("forbidden");
  return user;
}

const emailSchema = z.string().trim().toLowerCase().email();

/** Mantiene settings.admin_email alineado con ADMIN_EMAIL (lo lee el trigger de alta). */
async function syncAdminEmailSetting(adminEmail: string): Promise<void> {
  await withActor(serviceActor, (tx) => tx`
    insert into public.settings (key, value, value_type, description, is_public)
    values ('admin_email', ${tx.json(adminEmail)}, 'string', 'Correo que recibe rol admin al registrarse', false)
    on conflict (key) do update set value = excluded.value`);
}

export type MagicLinkResult = { ok: true; devLink: string | null } | { ok: false; error: "invalid_email" };

/**
 * Envía un enlace mágico de acceso al panel. Solo se crea usuario nuevo para
 * ADMIN_EMAIL; el resto del equipo entra por invitación. La respuesta es la
 * misma exista o no la cuenta (no revela correos registrados).
 */
export async function requestStaffMagicLink(rawEmail: string, rawNext: string | null): Promise<MagicLinkResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "invalid_email" };
  const email = parsed.data;
  const next = safeNextPath(rawNext, "/admin");
  const env = getServerEnv();
  const isAdminEmail = env.adminEmail !== undefined && env.adminEmail === email;
  if (isAdminEmail) await syncAdminEmailSetting(email);

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: isAdminEmail, emailRedirectTo: absoluteUrl(`/auth/confirm?next=${encodeURIComponent(next)}`) },
    });
    if (error) log.warn("enlace mágico no enviado", { email, error: error.message });
    return { ok: true, devLink: null };
  }

  const exists = await withActor(serviceActor, async (tx) => {
    const rows = await tx`select 1 from auth.users where lower(email) = ${email}`;
    return rows.length > 0;
  });
  if (!exists && !isAdminEmail) {
    log.info("enlace mágico omitido: correo sin cuenta", { email });
    return { ok: true, devLink: null };
  }

  const token = randomToken();
  await withActor(serviceActor, (tx) => tx`
    insert into auth.local_magic_links (token_hash, email, redirect_to, create_user, expires_at)
    values (${sha256Hex(token)}, ${email}, ${next}, ${isAdminEmail}, now() + make_interval(mins => ${MAGIC_LINK_TTL_MINUTES}))`);
  const link = absoluteUrl(`/auth/confirm?token=${token}&next=${encodeURIComponent(next)}`);
  const t = serverT("auth");
  await sendEmail({
    to: email,
    subject: t("emailSubject", { brand: brand.name }),
    text: t("emailText", { brand: brand.name, link, minutes: MAGIC_LINK_TTL_MINUTES }),
    html: `<p>${t("emailText", { brand: brand.name, link: `<a href="${link}">${link}</a>`, minutes: MAGIC_LINK_TTL_MINUTES })}</p>`,
  });
  const showLink = env.nodeEnv !== "production" || process.env.ALLOW_LOCAL_AUTH_LINKS === "true";
  return { ok: true, devLink: showLink ? link : null };
}

/** Canjea un enlace mágico local; crea la cookie de sesión. */
export async function redeemLocalMagicLink(token: string): Promise<{ ok: true; next: string } | { ok: false }> {
  const hash = sha256Hex(token);
  const result = await withActor(serviceActor, async (tx) => {
    const [link] = await tx<{ email: string; redirect_to: string | null; create_user: boolean }[]>`
      update auth.local_magic_links set used_at = now()
       where token_hash = ${hash} and used_at is null and expires_at > now()
       returning email, redirect_to, create_user`;
    if (!link) return null;
    let [user] = await tx<{ id: string; email: string }[]>`select id, email from auth.users where lower(email) = ${link.email}`;
    if (!user && link.create_user) {
      [user] = await tx<{ id: string; email: string }[]>`insert into auth.users (email) values (${link.email}) returning id, email`;
    }
    if (!user) return null;
    await tx`update auth.users set last_sign_in_at = now() where id = ${user.id}`;
    return { userId: user.id, email: user.email, next: link.redirect_to ?? "/admin" };
  });
  if (!result) return { ok: false };
  const store = await cookies();
  store.set(LOCAL_SESSION_COOKIE, await signLocalSession({ userId: result.userId, email: result.email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: brand.siteUrl.startsWith("https://"),
    path: "/",
    maxAge: LOCAL_SESSION_MAX_AGE,
  });
  return { ok: true, next: safeNextPath(result.next, "/admin") };
}

export async function signOutCurrentUser(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  const store = await cookies();
  store.delete(LOCAL_SESSION_COOKIE);
}
