import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listStaffUsers } from "@/lib/panel/users";
import { InviteForm, UserRowControls } from "./users-admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.users");
  return { title: t("title") };
}

/** Usuarios del equipo (solo admin): invitar, cambiar rol, desactivar. */
export default async function UsersPage() {
  const user = await requireStaff(["admin"], "/admin/usuarios");
  const t = await getTranslations("admin.users");
  const ta = await getTranslations("admin");
  const users = await listStaffUsers(user);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/admin/auditoria" className="text-sm text-forest hover:underline">
          {t("audit")}
        </Link>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <div className="mt-5">
        <InviteForm />
      </div>
      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm" data-testid="users">
          <thead className="bg-muted/60 text-left text-xs">
            <tr>
              <th scope="col" className="p-2">
                {t("columns.user")}
              </th>
              <th scope="col" className="p-2">
                {t("columns.role")}
              </th>
              <th scope="col" className="p-2">
                {t("columns.status")}
              </th>
              <th scope="col" className="p-2">
                {t("columns.lastSignIn")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.userId} data-testid="user-row">
                <td className="p-2">
                  <p className="font-medium">{u.name ?? u.email}</p>
                  {u.name ? <p className="text-xs text-muted-foreground">{u.email}</p> : null}
                </td>
                <td className="p-2">
                  <p className="mb-1 text-xs text-muted-foreground">{ta(`roles.${u.role}`)}</p>
                  <UserRowControls
                    row={{
                      userId: u.userId,
                      email: u.email,
                      name: u.name,
                      role: u.role,
                      isActive: u.isActive,
                      lastSignIn: u.lastSignInAt?.toISOString() ?? null,
                      isSelf: u.userId === user.userId,
                    }}
                  />
                </td>
                <td className="p-2">{u.isActive ? t("active") : t("inactive")}</td>
                <td className="p-2 text-muted-foreground">{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : t("never")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
