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

/**
 * Lo que el equipo puede cambiar a mano desde el selector del panel (REG-03,
 * PAN-01). "RFQ enviado", "Cotizada" y "Aceptada" solo los fija el sistema al
 * enviar el RFQ (o marcarlo enviado a mano), emitir la cotización y registrar
 * la aceptación; la base lo exige con app.system_transition (migración 013).
 */
export const MANUAL_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  draft: [],
  submitted: ["in_review"],
  in_review: ["data_pending"],
  data_pending: ["in_review"],
  rfq_sent: [],
  quoted: ["rejected"],
  accepted: [],
  rejected: [],
  expired: [],
};

/** Estados que solo fija el sistema. */
export const SYSTEM_ONLY_STATUSES: readonly RequestStatus[] = ["rfq_sent", "quoted", "accepted"];

export function canManuallyTransition(from: RequestStatus, to: RequestStatus): boolean {
  return MANUAL_TRANSITIONS[from].includes(to) && canTransition(from, to);
}

export function manualNextStatuses(from: RequestStatus): readonly RequestStatus[] {
  return MANUAL_TRANSITIONS[from];
}

/**
 * Máquina del pedido (PRD §14). Espejo de public.order_transition_allowed()
 * en 008_orders.sql; los hitos manuales de lib/orders mueven el pedido por
 * estas transiciones y el anticipo confirmado hace la primera.
 */
export const ORDER_STATUSES = ["pending_deposit", "deposit_received", "in_production", "qa", "shipped", "in_customs", "delivered", "closed"] as const;

export type OrderState = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  pending_deposit: ["deposit_received"],
  deposit_received: ["in_production"],
  in_production: ["qa"],
  qa: ["shipped"],
  shipped: ["in_customs", "delivered"],
  in_customs: ["delivered"],
  delivered: ["closed"],
  closed: [],
};

export function canOrderTransition(from: OrderState, to: OrderState): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
