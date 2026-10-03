"use server";

import { revalidatePath } from "next/cache";
import { assertStaff } from "@/lib/auth";
import { anonymizeRequest, type AnonymizeResult } from "@/lib/panel/personal-data";

export async function anonymizeAction(requestId: string, confirmNumber: string): Promise<AnonymizeResult> {
  const user = await assertStaff(["admin"]);
  const result = await anonymizeRequest(user, String(requestId), String(confirmNumber ?? ""));
  if (result.ok) revalidatePath("/admin/datos-personales");
  return result;
}
