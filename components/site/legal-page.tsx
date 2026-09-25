import { getTranslations } from "next-intl/server";
import { PageHeader, Section } from "./page-header";

/** Fecha de la última revisión de los textos legales. */
export const LEGAL_UPDATED = new Date("2026-09-24T12:00:00Z");

export async function LegalPage({
  doc,
  sections,
  values,
}: {
  doc: "privacy" | "terms";
  sections: readonly string[];
  values: Record<string, string | number>;
}) {
  const t = await getTranslations("legal");
  const date = new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeZone: "America/Panama" }).format(LEGAL_UPDATED);
  return (
    <>
      <PageHeader title={t(`${doc}.title`)} intro={t("updated", { date })} />
      <Section className="pb-20">
        <div className="max-w-3xl">
          {sections.map((key) => (
            <section key={key} className="border-t border-border py-6">
              <h2 className="text-xl font-bold">{t(`${doc}.sections.${key}.title` as "privacy.sections.who.title")}</h2>
              <p className="mt-2 leading-relaxed text-ink/90">{t(`${doc}.sections.${key}.body` as "privacy.sections.who.body", values)}</p>
            </section>
          ))}
          <p className="mt-6 text-sm text-muted-foreground">{t("draftNote")}</p>
        </div>
      </Section>
    </>
  );
}
