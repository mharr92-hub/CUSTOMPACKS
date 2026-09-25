import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { Wizard } from "@/components/wizard/wizard";
import { getPublicCatalog, quoteConditions } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import { todayInPanama } from "@/lib/leadtime";
import { loadDraft } from "@/lib/quote/drafts";
import { applyPreload, type Preload } from "@/lib/quote/flow";
import { trackingPath } from "@/lib/quote/links";
import { initialWizardState, type WizardState } from "@/lib/quote/types";
import { UTM_KEYS } from "@/lib/quote/utm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wizard");
  return { title: t("metaTitle"), alternates: { canonical: "/cotizar" }, robots: { index: true, follow: false } };
}

function param(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length <= 200 ? value : null;
}

export default async function QuotePage(props: PageProps<"/cotizar">) {
  const params = await props.searchParams;
  const catalog = await getPublicCatalog();
  const settings = quoteConditions(catalog);

  let state: WizardState = initialWizardState();
  let token: string | null = null;
  let authoritative = false;
  let preload: Preload | null = null;

  // Reanudar por enlace (?borrador=): el borrador del servidor manda. Esta URL
  // lleva el token, así que aquí no se carga la analítica (D-032).
  const draftToken = param(params.borrador);
  if (draftToken) {
    const draft = await loadDraft(draftToken);
    if (draft?.submittedRequestId) {
      const [row] = await withActor(serviceActor, (tx) => tx<{ access_token: string }[]>`
        select access_token from public.quote_requests where id = ${draft.submittedRequestId}`);
      if (row) redirect(trackingPath(row.access_token));
    }
    if (draft) {
      state = draft.state;
      token = draftToken;
      authoritative = true;
    }
  }

  if (!token) {
    // Entrada desde una ficha (?tipo=) o una muestra de la galería (?muestra=):
    // el wizard la suma al borrador en curso de este dispositivo, si lo hay.
    const type = catalog.productTypes.find((ty) => ty.code === param(params.tipo));
    const sample = catalog.gallery.find((g) => g.code === param(params.muestra));
    if (type || sample) {
      preload = { typeId: type?.id ?? null, sampleId: sample?.id ?? null };
      state = applyPreload(state, preload, catalog).state;
    }
    const utm = Object.fromEntries(UTM_KEYS.flatMap((k) => (param(params[k]) ? [[k, param(params[k]) as string]] : [])));
    const referrer = (await headers()).get("referer") ?? "";
    state = { ...state, utm, referrer: referrer.slice(0, 500) };
  }

  return (
    <>
      <Wizard
        catalog={catalog}
        settings={settings}
        today={todayInPanama()}
        initialState={state}
        initialToken={token}
        initialIsAuthoritative={authoritative}
        preload={preload}
      />
      {draftToken ? null : <AnalyticsScripts />}
    </>
  );
}
