import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/** Las 8 etapas del recorrido del cliente (PRD §6). Es una secuencia real, por eso va numerada. */
export const STEP_KEYS = ["discover", "configure", "validate", "quote", "approve", "produce", "deliver", "reorder"] as const;
const TIMED = new Set(["configure", "quote", "deliver"]);

export async function StepsCompact({ className }: { className?: string }) {
  const t = await getTranslations("howItWorks");
  return (
    <ol className={cn("grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {STEP_KEYS.map((key, i) => (
        <li key={key} className="relative border-t-2 border-dashed border-forest/40 pt-3">
          <span className="tabular text-sm font-bold text-forest">{String(i + 1).padStart(2, "0")}</span>
          <p className="mt-1 font-semibold">{t(`steps.${key}.title`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${key}.see`)}</p>
        </li>
      ))}
    </ol>
  );
}

export async function StepsDetailed() {
  const t = await getTranslations("howItWorks");
  return (
    <ol className="space-y-0">
      {STEP_KEYS.map((key, i) => (
        <li key={key} className="grid gap-4 border-t-2 border-dashed border-forest/35 py-8 md:grid-cols-[8rem_1fr]">
          <div>
            <span className="tabular text-4xl font-extrabold tracking-tight text-forest">{String(i + 1).padStart(2, "0")}</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t(`steps.${key}.title`)}</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm font-semibold text-kraft-dark">{t("you")}</dt>
                <dd className="mt-1 text-sm">{t(`steps.${key}.you`)}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-kraft-dark">{t("us")}</dt>
                <dd className="mt-1 text-sm">{t(`steps.${key}.us`)}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-kraft-dark">{t("see")}</dt>
                <dd className="mt-1 text-sm">{t(`steps.${key}.see`)}</dd>
              </div>
            </dl>
            {TIMED.has(key) ? (
              <p className="mt-4 inline-block rounded-sm bg-kraft-light px-2 py-1 text-sm font-medium">
                {t("time")}
                {": "}
                {t(`steps.${key as "configure"}.time`)}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
