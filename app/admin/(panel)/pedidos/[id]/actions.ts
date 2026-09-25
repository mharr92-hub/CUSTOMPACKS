"use server";

import { revalidatePath } from "next/cache";
import { assertStaff, EDITOR_ROLES } from "@/lib/auth";
import { kickNotifications } from "@/lib/notify";
import {
  confirmEvidenceUpload,
  evidenceUrl,
  prepareEvidenceUpload,
  receiptUrl,
  recordMilestone,
  recordPayment,
  reviewPayment,
  updateShipping,
  type MilestoneInput,
  type OrderResult,
  type PaymentInput,
  type UploadConfirm,
  type UploadSlot,
} from "@/lib/orders";

/* Acciones del equipo sobre un pedido (editores; el viewer solo lee). */
function refresh(orderId: string) {
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/pedidos");
}

export async function recordMilestoneAction(orderId: string, input: MilestoneInput): Promise<OrderResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await recordMilestone(user, String(orderId), {
    type: String(input.type),
    occurredAt: String(input.occurredAt ?? ""),
    notes: String(input.notes ?? ""),
    qa: input.qa,
    transport: String(input.transport ?? ""),
    tracking: String(input.tracking ?? ""),
    eta: String(input.eta ?? ""),
  });
  if (result.ok) {
    kickNotifications();
    refresh(orderId);
  }
  return result.ok ? { ok: true } : result;
}

export async function updateShippingAction(orderId: string, input: { transport: string; tracking: string; eta: string; notes: string }): Promise<OrderResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await updateShipping(user, String(orderId), {
    transport: String(input.transport ?? ""),
    tracking: String(input.tracking ?? ""),
    eta: String(input.eta ?? ""),
    notes: String(input.notes ?? ""),
  });
  if (result.ok) refresh(orderId);
  return result;
}

export async function recordPaymentAction(orderId: string, input: PaymentInput): Promise<OrderResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await recordPayment(user, String(orderId), {
    kind: String(input.kind),
    amount: String(input.amount ?? ""),
    method: String(input.method ?? ""),
    reference: String(input.reference ?? ""),
    paidOn: String(input.paidOn ?? ""),
  });
  if (result.ok) {
    kickNotifications();
    refresh(orderId);
  }
  return result;
}

export async function reviewPaymentAction(
  orderId: string,
  paymentId: string,
  input: { decision: "confirm" | "reject"; amount?: string; method?: string; reference?: string; paidOn?: string; notes?: string },
): Promise<OrderResult> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await reviewPayment(user, String(paymentId), {
    decision: input.decision === "reject" ? "reject" : "confirm",
    amount: String(input.amount ?? ""),
    method: String(input.method ?? ""),
    reference: String(input.reference ?? ""),
    paidOn: String(input.paidOn ?? ""),
    notes: String(input.notes ?? ""),
  });
  if (result.ok) {
    kickNotifications();
    refresh(orderId);
  }
  return result;
}

export async function prepareEvidenceUploadAction(milestoneId: string, file: { name: string; size: number }): Promise<UploadSlot> {
  const user = await assertStaff(EDITOR_ROLES);
  return prepareEvidenceUpload(user, String(milestoneId), { name: String(file.name).slice(0, 200), size: Number(file.size) });
}

export async function confirmEvidenceUploadAction(orderId: string, milestoneId: string, input: { path: string; name: string }): Promise<UploadConfirm> {
  const user = await assertStaff(EDITOR_ROLES);
  const result = await confirmEvidenceUpload(user, String(milestoneId), { path: String(input.path), name: String(input.name).slice(0, 200) });
  if (result.ok) refresh(orderId);
  return result;
}

export async function evidenceUrlAction(orderId: string, path: string): Promise<string | null> {
  const user = await assertStaff();
  return evidenceUrl({ user }, String(orderId), String(path));
}

export async function receiptUrlAction(paymentId: string): Promise<string | null> {
  const user = await assertStaff();
  return receiptUrl(user, String(paymentId));
}
