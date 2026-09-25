import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Wizard } from "@/components/wizard/wizard";
import { getPublicCatalog, publicSetting } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import { todayInPanama } from "@/lib/leadtime";
import { loadDraft } from "@/lib/quote/drafts";
import { setItemType } from "@/lib/quote/flow";
import { initialWizardState, type WizardState } from "@/lib/quote/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wizard");
  return { title: t("metaTitle"), alternates: { canonical: "/cotizar" }, robots: { index: true, follow: false } };
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];

function param(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length <= 200 ? value : null;
}

export default async function QuotePage(props: PageProps<"/cotizar">) {
  const params = await props.searchParams;
  const catalog = await getPublicCatalog();
  const settings = {
    leadTime: {
      thresholdUnits: publicSetting(catalog, "lead_time_threshold_units", 10000),
      smallDays: publicSetting(catalog, "lead_time_days_small", 30),
      standardDays: publicSetting(catalog, "lead_time_days_standard", 45),
    },
    depositPct: publicSetting(catalog, "deposit_pct", 50),
  };

  let state: WizardState = initialWizardState();
  let token: string | null = null;
  let authoritative = false;

  // Reanudar por enlace (?borrador=): el borrador del servidor manda.
  const draftToken = param(params.borrador);
  if (draftToken) {
    const draft = await loadDraft(draftToken);
    if (draft?.submittedRequestId) {
      const [row] = await withActor(serviceActor, (tx) => tx<{ access_token: string }[]>`
        select access_token from public.quote_requests where id = ${draft.submittedRequestId}`);
      if (row) redirect(`/cotizar/listo/${row.access_token}`);
    }
    if (draft) {
      state = draft.state;
      token = draftToken;
      authoritative = true;
    }
  }

  if (!token) {
    // Entrada precargada desde una ficha (?tipo=) o una muestra de la galería (?muestra=).
    const type = catalog.productTypes.find((ty) => ty.code === param(params.tipo));
    const sample = catalog.gallery.find((g) => g.code === param(params.muestra));
    const first = state.items[0];
    if (first && (type || sample)) {
      let item = first;
      const typeId = type?.id ?? sample?.productTypeId ?? null;
      if (typeId) item = setItemType(item, typeId, catalog);
      if (sample) item = { ...item, referenceSampleIds: [sample.id] };
      const segments = catalog.productTypes.find((ty) => ty.id === typeId)?.segments ?? [];
      state = { ...state, items: [item], segment: segments.length === 1 ? (segments[0] ?? null) : null };
      authoritative = true;
    }
    const utm = Object.fromEntries(UTM_KEYS.flatMap((k) => (param(params[k]) ? [[k, param(params[k]) as string]] : [])));
    const referrer = (await headers()).get("referer") ?? "";
    state = { ...state, utm, referrer: referrer.slice(0, 500) };
  }

  return (
    <Wizard
      catalog={catalog}
      settings={settings}
      today={todayInPanama()}
      initialState={state}
      initialToken={token}
      initialIsAuthoritative={authoritative}
    />
  );
}
