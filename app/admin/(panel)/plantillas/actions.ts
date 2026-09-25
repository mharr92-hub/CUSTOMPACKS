"use server";

import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/auth";
import { updateTemplate, type TemplateSaveResult } from "@/lib/notify/templates";

export async function saveTemplateAction(id: string, input: { subject: string; body: string; isActive: boolean }): Promise<TemplateSaveResult> {
  const user = await assertStaff(["admin"]);
  const result = await updateTemplate(user, String(id), { subject: String(input.subject ?? ""), body: String(input.body ?? ""), isActive: Boolean(input.isActive) });
  if (result.ok) {
    revalidatePath("/admin/plantillas");
    revalidatePath(`/admin/plantillas/${id}`);
  }
  return result;
}
