/**
 * Máquina de estados de la solicitud (PRD §14). Es espejo de
 * public.request_transition_allowed() en 003_quotes.sql: la base la hace
 * cumplir con un trigger y el panel la usa para ofrecer solo acciones válidas.
 */
export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "data_pending",
  "rfq_sent",
  "quoted",
  "accepted",
  "rejected",
  "expired",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  draft: ["submitted"],
  submitted: ["in_review"],
  in_review: ["data_pending", "rfq_sent"],
  data_pending: ["in_review"],
  rfq_sent: ["quoted"],
  quoted: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: ["quoted"],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: RequestStatus): readonly RequestStatus[] {
  return REQUEST_TRANSITIONS[from];
}

/** Motivos de pérdida (lista cerrada, obligatoria al rechazar). */
export const LOSS_REASONS = ["price", "lead_time", "specification", "no_response", "other"] as const;
export type LossReason = (typeof LOSS_REASONS)[number];

export function isTerminal(status: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[status].length === 0;
}
