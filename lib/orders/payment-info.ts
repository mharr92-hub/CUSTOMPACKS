import type { Tx } from "@/lib/db/client";

/**
 * Datos para pagar (Bloque 3): banco, tipo de cuenta, número, beneficiario y
 * correo de comprobantes, más instrucciones libres (Yappy, referencia…). Se
 * cargan en Configuración y los leen el portal del pedido y el PDF de la
 * cotización. No son públicos (D-111): solo los ve quien tiene el enlace de un
 * pedido o la cotización emitida.
 */
export type PaymentInfo = {
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  receiptsEmail: string;
  notes: string;
};

export const PAYMENT_SETTING_KEYS = {
  bank: "payment_bank_name",
  accountType: "payment_account_type",
  accountNumber: "payment_account_number",
  holder: "payment_account_holder",
  receiptsEmail: "payment_receipts_email",
  notes: "payment_instructions",
} as const satisfies Record<keyof PaymentInfo, string>;

export function paymentInfoFrom(rows: readonly { key: string; value: unknown }[]): PaymentInfo {
  const get = (key: string) => {
    const v = rows.find((r) => r.key === key)?.value;
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    bank: get(PAYMENT_SETTING_KEYS.bank),
    accountType: get(PAYMENT_SETTING_KEYS.accountType),
    accountNumber: get(PAYMENT_SETTING_KEYS.accountNumber),
    holder: get(PAYMENT_SETTING_KEYS.holder),
    receiptsEmail: get(PAYMENT_SETTING_KEYS.receiptsEmail),
    notes: get(PAYMENT_SETTING_KEYS.notes),
  };
}

/** Hay con qué pagar: la cuenta completa (banco, número y beneficiario) o instrucciones libres. */
export function hasPaymentInfo(info: PaymentInfo): boolean {
  return Boolean((info.bank && info.accountNumber && info.holder) || info.notes);
}

/** Lee los datos de pago (con el servicio: los settings no son públicos). */
export async function loadPaymentInfo(tx: Tx): Promise<PaymentInfo> {
  const rows = await tx<{ key: string; value: unknown }[]>`
    select key, value from public.settings where key in ${tx(Object.values(PAYMENT_SETTING_KEYS))}`;
  return paymentInfoFrom(rows);
}
