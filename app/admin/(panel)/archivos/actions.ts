"use server";

import { revalidatePath } from "next/cache";
import { confirmArtworkDeletion, confirmRecordDeletion } from "@/lib/artwork/retention";
import { assertStaff } from "@/lib/auth";

export type DeletionState = { status: "idle" } | { status: "done"; deleted: number } | { status: "empty" };

/** Admin confirma el borrado de los archivos marcados que eligió. */
export async function confirmDeletionAction(_prev: DeletionState, form: FormData): Promise<DeletionState> {
  const user = await assertStaff(["admin"]);
  const ids = form.getAll("file").map(String);
  const records = form.getAll("record").map(String);
  if (ids.length === 0 && records.length === 0) return { status: "empty" };
  const deleted = (await confirmArtworkDeletion(user, ids)) + (await confirmRecordDeletion(user, records));
  revalidatePath("/admin/archivos");
  return { status: "done", deleted };
}
