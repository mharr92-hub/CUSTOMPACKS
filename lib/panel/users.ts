import "server-only";
import { z } from "zod";
import { actorFor, requestStaffMagicLink, type AppRole, type CurrentUser } from "@/lib/auth";
import { serviceActor, withActor } from "@/lib/db/actor";
import { log } from "@/lib/log";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { absoluteUrl } from "@/lib/urls";

/** Usuarios del equipo (PRD §11, roles): invitar, cambiar rol y desactivar. Solo admin. */
export const STAFF_ROLE_OPTIONS = ["admin", "sales", "ops", "viewer"] as const satisfies readonly AppRole[];
export type StaffRole = (typeof STAFF_ROLE_OPTIONS)[number];

export type StaffUser = { userId: string; email: string | null; name: string | null; role: AppRole; isActive: boolean; lastSignInAt: Date | null; createdAt: Date };

export async function listStaffUsers(user: CurrentUser): Promise<StaffUser[]> {
  const rows = await withActor(actorFor(user), (tx) => tx<
    { user_id: string; email: string | null; name: string | null; role: AppRole; is_active: boolean; created_at: Date }[]
  >`
    select user_id, email, name, role, is_active, created_at from public.profiles
     where role <> 'client' order by is_active desc, coalesce(name, email)`);
  const signIns = await withActor(serviceActor, (tx) => tx<{ id: string; last_sign_in_at: Date | null }[]>`
    select id, last_sign_in_at from auth.users where id = any(${rows.map((r) => r.user_id)}::uuid[])`);
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.name,
    role: r.role,
    isActive: r.is_active,
    createdAt: r.created_at,
    lastSignInAt: signIns.find((s) => s.id === r.user_id)?.last_sign_in_at ?? null,
  }));
}

export type UserActionResult = { ok: true; devLink?: string | null } | { ok: false; error: "forbidden" | "email" | "role" | "exists" | "self" | "last_admin" | "not_found" | "generic" };

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(120), role: z.enum(STAFF_ROLE_OPTIONS) });

/**
 * Invita por correo: crea la cuenta con su rol y envía el enlace de acceso
 * (Supabase Auth, o enlace local simulado en desarrollo).
 */
export async function inviteStaffUser(user: CurrentUser, input: { email: string; name: string; role: string }): Promise<UserActionResult> {
  if (user.role !== "admin" || !user.isActive) return { ok: false, error: "forbidden" };
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "role") ? "role" : "email" };
  const { email, name, role } = parsed.data;
  const exists = await withActor(serviceActor, (tx) => tx`select 1 from auth.users where lower(email) = ${email}`);
  if (exists.length) return { ok: false, error: "exists" };
  try {
    let userId: string | null = null;
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo: absoluteUrl("/auth/confirm?next=%2Fadmin"),
      });
      if (error || !data.user) throw new Error(error?.message ?? "sin usuario");
      userId = data.user.id;
    } else {
      const [created] = await withActor(serviceActor, (tx) => tx<{ id: string }[]>`
        insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
        values (${email}, ${tx.json({ name })}, ${tx.json({ role })}) returning id`);
      userId = created?.id ?? null;
    }
    if (!userId) return { ok: false, error: "generic" };
    // El rol lo fija el servicio (el trigger de alta deja "client" si no viene en app_metadata).
    await withActor(serviceActor, (tx) => tx`update public.profiles set role = ${role}, name = ${name || null} where user_id = ${userId}`);
    const link = supabase ? { ok: true as const, devLink: null } : await requestStaffMagicLink(email, "/admin");
    return { ok: true, devLink: link.ok ? link.devLink : null };
  } catch (error) {
    log.error("no se pudo invitar al usuario", { error, email });
    return { ok: false, error: "generic" };
  }
}

function isLastAdminError(error: unknown): boolean {
  return error instanceof Error && /al menos un administrador/i.test(error.message);
}

export async function changeStaffRole(user: CurrentUser, targetUserId: string, role: string): Promise<UserActionResult> {
  if (user.role !== "admin" || !user.isActive) return { ok: false, error: "forbidden" };
  if (!(STAFF_ROLE_OPTIONS as readonly string[]).includes(role)) return { ok: false, error: "role" };
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return { ok: false, error: "not_found" };
  if (targetUserId === user.userId) return { ok: false, error: "self" };
  try {
    const rows = await withActor(actorFor(user), (tx) => tx`update public.profiles set role = ${role} where user_id = ${targetUserId} returning id`);
    return rows.length ? { ok: true } : { ok: false, error: "not_found" };
  } catch (error) {
    if (isLastAdminError(error)) return { ok: false, error: "last_admin" };
    throw error;
  }
}

export async function setStaffActive(user: CurrentUser, targetUserId: string, active: boolean): Promise<UserActionResult> {
  if (user.role !== "admin" || !user.isActive) return { ok: false, error: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return { ok: false, error: "not_found" };
  if (targetUserId === user.userId) return { ok: false, error: "self" };
  try {
    const rows = await withActor(actorFor(user), (tx) => tx`update public.profiles set is_active = ${active} where user_id = ${targetUserId} returning id`);
    return rows.length ? { ok: true } : { ok: false, error: "not_found" };
  } catch (error) {
    if (isLastAdminError(error)) return { ok: false, error: "last_admin" };
    throw error;
  }
}
