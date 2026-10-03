"use client";

import { useTranslations } from "next-intl";
import { formatMoney, formatUnitPrice, parseMoney } from "@/lib/quotes/pricing";

/**
 * Muestra cómo se va a guardar lo que se escribió en un campo de dinero
 * ("= USD 5,000.00"), para que una coma de miles nunca se guarde distinto de
 * lo que el vendedor cree (REG-01).
 */
export function MoneyHint({ value, currency, unit = false }: { value: string; currency: string; unit?: boolean }) {
  const t = useTranslations("admin.money");
  if (!value.trim()) return null;
  const n = parseMoney(value);
  if (n === null) {
    return (
      <span className="text-xs font-normal text-destructive" data-testid="money-hint">
        {t("invalid")}
      </span>
    );
  }
  return (
    <span className="tabular text-xs font-normal text-muted-foreground" data-testid="money-hint">
      {t("interpreted", { value: unit ? formatUnitPrice(n, currency) : formatMoney(n, currency) })}
    </span>
  );
}
