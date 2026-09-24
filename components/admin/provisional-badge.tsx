import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

/** Etiqueta PROVISIONAL para valores por validar (solo panel interno, regla 6 de CLAUDE.md). */
export async function ProvisionalBadge() {
  const t = await getTranslations("admin");
  return (
    <Badge variant="outline" title={t("provisionalHint")} className="border-signal-yellow/50 bg-signal-yellow/10 text-[10px] font-semibold tracking-wide text-signal-yellow">
      {t("provisional")}
    </Badge>
  );
}

export async function InactiveBadge() {
  const t = await getTranslations("admin");
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      {t("inactive")}
    </Badge>
  );
}
