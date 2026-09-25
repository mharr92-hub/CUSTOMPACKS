"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { checkDesiredDate, leadTimeDaysForQuantities } from "@/lib/leadtime";
import { ARTWORK_CHOICES, FREQUENCIES, LEAD_SOURCES, type ItemDraft } from "@/lib/quote/types";
import { itemHasPrinting, parseQuantity, type ErrorKey } from "@/lib/quote/validate";
import { useWizard } from "./context";
import { Fieldset, OptionCard, TextField } from "./fields";

const CHECKLIST = ["format", "dieline", "color", "resolution", "bleed", "fonts", "layer", "naming"] as const;

function usePieceLabel() {
  const t = useTranslations("wizard");
  const { catalog, state } = useWizard();
  return (item: ItemDraft, index: number) => {
    const type = catalog.productTypes.find((ty) => ty.id === item.productTypeId);
    const label = t("pieceOf", { n: index + 1, total: state.items.length });
    return type ? `${label}: ${type.name}` : item.needsAdvice ? `${label}: ${t("type.adviceTitle")}` : label;
  };
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-PA", { dateStyle: "long", timeZone: "UTC" }).format(d);
}

// ---------------------------------------------------------------------------
// Paso 6 · Cantidad y fecha
// ---------------------------------------------------------------------------
export function StepQuantity() {
  const t = useTranslations("wizard.quantity");
  const tw = useTranslations("wizard");
  const { state, update, updateItem, errors, settings, today } = useWizard();
  const pieceLabel = usePieceLabel();
  const allQuantities = state.items.flatMap((it) => it.quantities.map(parseQuantity)).map((q) => (typeof q === "number" ? q : null));
  const days = leadTimeDaysForQuantities(allQuantities, settings.leadTime);
  const { earliest, tooSoon } = checkDesiredDate(state.desiredDate, days, today);

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">{t("intro")}</p>
      {state.items.map((item, i) => (
        <section key={item.key} aria-labelledby={`piece-${item.key}`} className="space-y-4 rounded-lg border border-border p-4">
          <h3 id={`piece-${item.key}`} className="font-semibold">
            {pieceLabel(item, i)}
          </h3>
          <Fieldset id={`items.${i}.quantities`} legend={t("quantitiesLegend")} hint={t("quantitiesHint")} error={errors[`items.${i}.quantities`]}>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((j) => (
                <TextField
                  key={j}
                  id={`items.${i}.quantities.${j}`}
                  label={t("quantity", { n: j + 1 })}
                  value={item.quantities[j] ?? ""}
                  placeholder={j === 0 ? t("quantityPlaceholder") : undefined}
                  inputMode="numeric"
                  error={errors[`items.${i}.quantities.${j}`]}
                  maxLength={12}
                  onChange={(v) =>
                    updateItem((it) => {
                      const q = [...it.quantities] as ItemDraft["quantities"];
                      q[j] = v;
                      return { ...it, quantities: q };
                    }, i)
                  }
                />
              ))}
            </div>
          </Fieldset>
          <div>
            <label htmlFor={`items.${i}.frequency`} className="block text-sm font-semibold">
              {t("frequency")}
            </label>
            <select
              id={`items.${i}.frequency`}
              value={item.frequency ?? ""}
              aria-invalid={errors[`items.${i}.frequency`] ? true : undefined}
              aria-describedby={errors[`items.${i}.frequency`] ? `items.${i}.frequency-error` : undefined}
              onChange={(e) => updateItem((it) => ({ ...it, frequency: (e.target.value || null) as ItemDraft["frequency"] }), i)}
              className="mt-1.5 block h-[46px] w-full rounded-md border border-input bg-paper px-3 text-base aria-invalid:border-destructive"
            >
              <option value="">{tw("contact.sourceEmpty")}</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {tw(`frequencyOptions.${f}`)}
                </option>
              ))}
            </select>
            {errors[`items.${i}.frequency`] ? (
              <p id={`items.${i}.frequency-error`} className="mt-1.5 text-sm font-medium text-destructive" data-field-error>
                {tw(`errors.${errors[`items.${i}.frequency`] as ErrorKey}`)}
              </p>
            ) : null}
          </div>
        </section>
      ))}

      <div className="space-y-3">
        <TextField
          id="desiredDate"
          type="date"
          label={t("desiredDate")}
          hint={t("desiredDateHint")}
          value={state.desiredDate}
          onChange={(desiredDate) => update((s) => ({ ...s, desiredDate }))}
          error={errors.desiredDate}
          optional
        />
        <div aria-live="polite" className="rounded-lg bg-kraft-light p-4 text-sm">
          {days ? (
            <>
              <p className="text-base font-bold">{t("leadTime", { days })}</p>
              <p className="mt-1">{t("leadTimeNote")}</p>
              {earliest && !tooSoon ? <p className="mt-2">{t("earliest", { date: formatDate(earliest) })}</p> : null}
              {tooSoon && earliest ? <p className="mt-2 font-semibold text-signal-red">{t("tooSoon", { date: formatDate(earliest) })}</p> : null}
            </>
          ) : (
            <p>{t("leadTimeEmpty")}</p>
          )}
          <p className="mt-2 text-ink/80">{t("conditions", { deposit: settings.depositPct, balance: 100 - settings.depositPct })}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 7 · Arte y referencias
// ---------------------------------------------------------------------------
function SamplePicker({ index, item }: { index: number; item: ItemDraft }) {
  const t = useTranslations("wizard.artwork");
  const { catalog, updateItem } = useWizard();
  const [choice, setChoice] = useState("");
  const available = catalog.gallery.filter((g) => !item.referenceSampleIds.includes(g.id));
  const selected = catalog.gallery.filter((g) => item.referenceSampleIds.includes(g.id));
  const id = `items.${index}.samples`;
  return (
    <div>
      <p className="text-sm font-semibold">{t("samples")}</p>
      {selected.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {selected.map((g) => (
            <li key={g.id} className="inline-flex items-center gap-1 rounded-full bg-kraft-light py-1 pr-1 pl-3 text-sm">
              <span className="font-semibold">{g.code}</span>
              <span className="max-w-40 truncate text-muted-foreground">{g.name}</span>
              <button
                type="button"
                aria-label={t("removeSample", { code: g.code })}
                onClick={() => updateItem((it) => ({ ...it, referenceSampleIds: it.referenceSampleIds.filter((s) => s !== g.id) }), index)}
                className="rounded-full p-1 hover:bg-paper"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {available.length > 0 ? (
        <div className="mt-2 flex gap-2">
          <label htmlFor={id} className="sr-only">
            {t("chooseSample")}
          </label>
          <select id={id} value={choice} onChange={(e) => setChoice(e.target.value)} className="h-10 w-0 min-w-0 flex-1 truncate rounded-md border border-input bg-paper px-2 text-sm">
            <option value="">{t("chooseSample")}</option>
            {available.map((g) => (
              <option key={g.id} value={g.id}>
                {`${g.code} · ${g.name}`}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            disabled={!choice}
            onClick={() => {
              updateItem((it) => ({ ...it, referenceSampleIds: [...it.referenceSampleIds, choice].slice(0, 10) }), index);
              setChoice("");
            }}
          >
            {t("addSample")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LinkList({ index, item }: { index: number; item: ItemDraft }) {
  const t = useTranslations("wizard.artwork");
  const { updateItem, errors } = useWizard();
  const setLinks = (fn: (links: string[]) => string[]) => updateItem((it) => ({ ...it, referenceLinks: fn(it.referenceLinks) }), index);
  return (
    <div>
      <p className="text-sm font-semibold">{t("links")}</p>
      <div className="mt-2 space-y-2">
        {item.referenceLinks.map((link, j) => (
          <div key={j} className="flex items-start gap-2">
            <div className="flex-1">
              <TextField
                id={`items.${index}.links.${j}`}
                label={`${t("links")} ${j + 1}`}
                type="url"
                value={link}
                placeholder={t("linkPlaceholder")}
                error={errors[`items.${index}.links.${j}`]}
                onChange={(v) => setLinks((l) => l.map((x, k) => (k === j ? v : x)))}
                maxLength={500}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" className="mt-7" aria-label={t("removeLink")} onClick={() => setLinks((l) => l.filter((_, k) => k !== j))}>
              <XIcon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      {item.referenceLinks.length < 5 ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setLinks((l) => [...l, ""])}>
          <PlusIcon className="size-4" />
          {t("addLink")}
        </Button>
      ) : null}
    </div>
  );
}

export function StepArtwork() {
  const t = useTranslations("wizard.artwork");
  const tw = useTranslations("wizard");
  const { state, catalog, updateItem, errors } = useWizard();
  const pieceLabel = usePieceLabel();
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-8">
        <p className="text-muted-foreground">{t("intro")}</p>
        {state.items.map((item, i) => {
          const printing = itemHasPrinting(item, catalog);
          return (
            <section key={item.key} aria-labelledby={`art-${item.key}`} className="space-y-5 rounded-lg border border-border p-4">
              <h3 id={`art-${item.key}`} className="font-semibold">
                {pieceLabel(item, i)}
              </h3>
              {printing ? (
                <Fieldset id={`items.${i}.artwork`} legend={t("choice")} error={errors[`items.${i}.artwork`]}>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {ARTWORK_CHOICES.map((c) => (
                      <OptionCard
                        key={c}
                        type="radio"
                        name={`artwork-${i}`}
                        value={c}
                        checked={item.artwork === c}
                        onChange={() => updateItem((it) => ({ ...it, artwork: c }), i)}
                        title={tw(`artworkOptions.${c}`)}
                        className="p-3"
                      />
                    ))}
                  </div>
                  {item.artwork === "has_artwork" ? <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{t("uploadSoon")}</p> : null}
                </Fieldset>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noPrint")}</p>
              )}
              <div className="space-y-4">
                <div>
                  <p className="font-semibold">{t("references")}</p>
                  <p className="text-sm text-muted-foreground">{t("referencesHint")}</p>
                </div>
                <SamplePicker index={i} item={item} />
                <LinkList index={i} item={item} />
              </div>
            </section>
          );
        })}
      </div>
      <aside aria-labelledby="checklist-title" className="h-fit rounded-lg bg-kraft-light p-4 lg:sticky lg:top-24">
        <h3 id="checklist-title" className="font-semibold">
          {t("checklistTitle")}
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          {CHECKLIST.map((k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden="true" className="mt-1 size-3 shrink-0 rounded-sm border border-kraft-dark" />
              {tw(`checklist.${k}`)}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 8 · Contacto y entrega
// ---------------------------------------------------------------------------
export function StepContact() {
  const t = useTranslations("wizard.contact");
  const tw = useTranslations("wizard");
  const { state, update, errors } = useWizard();
  const c = state.contact;
  const set = (patch: Partial<typeof c>) => update((s) => ({ ...s, contact: { ...s.contact, ...patch } }));
  return (
    <div className="space-y-5">
      <p className="text-muted-foreground">{t("intro")}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="contact.company" label={t("company")} value={c.company} onChange={(company) => set({ company })} autoComplete="organization" optional maxLength={200} />
        <TextField id="contact.ruc" label={t("ruc")} value={c.ruc} onChange={(ruc) => set({ ruc })} optional maxLength={40} />
        <TextField id="contact.name" label={t("name")} value={c.name} onChange={(name) => set({ name })} autoComplete="name" error={errors["contact.name"]} maxLength={160} />
        <TextField id="contact.position" label={t("position")} value={c.position} onChange={(position) => set({ position })} autoComplete="organization-title" optional maxLength={120} />
        <TextField
          id="contact.whatsapp"
          type="tel"
          label={t("whatsapp")}
          value={c.whatsapp}
          onChange={(whatsapp) => set({ whatsapp })}
          placeholder={t("whatsappPlaceholder")}
          hint={t("whatsappHint")}
          autoComplete="tel"
          inputMode="tel"
          error={errors["contact.whatsapp"]}
          maxLength={40}
        />
        <TextField
          id="contact.email"
          type="email"
          label={t("email")}
          value={c.email}
          onChange={(email) => set({ email })}
          placeholder={t("emailPlaceholder")}
          hint={t("contactHint")}
          autoComplete="email"
          inputMode="email"
          error={errors["contact.email"]}
          maxLength={200}
        />
        <TextField id="contact.city" label={t("city")} value={c.city} onChange={(city) => set({ city })} autoComplete="address-level2" error={errors["contact.city"]} maxLength={120} />
        <TextField id="contact.address" label={t("address")} value={c.address} onChange={(address) => set({ address })} autoComplete="street-address" error={errors["contact.address"]} maxLength={400} />
      </div>
      <div>
        <label htmlFor="contact.source" className="block text-sm font-semibold">
          {t("source")}
          <span className="ml-1 font-normal text-muted-foreground">{`(${tw("optional")})`}</span>
        </label>
        <select
          id="contact.source"
          value={c.source}
          onChange={(e) => set({ source: e.target.value as typeof c.source })}
          className="mt-1.5 block h-[46px] w-full rounded-md border border-input bg-paper px-3 text-base"
        >
          <option value="">{t("sourceEmpty")}</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {tw(`sourceOptions.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <TextField id="contact.comments" label={t("comments")} value={c.comments} onChange={(comments) => set({ comments })} placeholder={t("commentsPlaceholder")} optional multiline maxLength={2000} />
      <div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="contact.consent"
            type="checkbox"
            checked={c.consent}
            onChange={(e) => set({ consent: e.target.checked })}
            aria-invalid={errors["contact.consent"] ? true : undefined}
            aria-describedby={errors["contact.consent"] ? "contact.consent-error" : undefined}
            className="mt-1 size-5 shrink-0 accent-forest"
          />
          <span className="text-sm">
            {t("consent", { brand: brand.name })}{" "}
            <Link href="/legal/privacidad" target="_blank" className="font-semibold text-forest underline underline-offset-4">
              {t("privacyLink")}
            </Link>
          </span>
        </label>
        {errors["contact.consent"] ? (
          <p id="contact.consent-error" className="mt-1.5 text-sm font-medium text-destructive" data-field-error>
            {tw(`errors.${errors["contact.consent"] as ErrorKey}`)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
