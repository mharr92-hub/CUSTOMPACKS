"use server";

import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/auth";
import { changeStaffRole, inviteStaffUser, setStaffActive, type UserActionResult } from "@/lib/panel/users";

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<UserActionResult> {
  const user = await assertStaff(["admin"]);
  const result = await inviteStaffUser(user, { email: String(input.email), name: String(input.name ?? ""), role: String(input.role) });
  if (result.ok) revalidatePath("/admin/usuarios");
  return result;
}

export async function changeRoleAction(userId: string, role: string): Promise<UserActionResult> {
  const user = await assertStaff(["admin"]);
  const result = await changeStaffRole(user, String(userId), String(role));
  if (result.ok) revalidatePath("/admin/usuarios");
  return result;
}

export async function setActiveAction(userId: string, active: boolean): Promise<UserActionResult> {
  const user = await assertStaff(["admin"]);
  const result = await setStaffActive(user, String(userId), Boolean(active));
  if (result.ok) revalidatePath("/admin/usuarios");
  return result;
}
