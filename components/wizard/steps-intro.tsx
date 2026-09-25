"use client";

import { useTranslations } from "next-intl";
import { ShoppingBagIcon, SparklesIcon, UtensilsIcon } from "lucide-react";
import { CONDITIONS } from "@/lib/catalog/entities";
import { setSegment } from "@/lib/quote/flow";
import { PRODUCT_USES, type WizardSegment } from "@/lib/quote/types";
import { useWizard } from "./context";
import { CheckChips, Fieldset, OptionCard, TextField, toggleIn } from "./fields";

export function StepSegment({ onPicked }: { onPicked: () => void }) {
  const t = useTranslations("wizard.segment");
  const { state, catalog, update, errors } = useWizard();
  const options: { value: WizardSegment; icon: typeof ShoppingBagIcon; title: string; body: string }[] = [
    { value: "commercial", icon: ShoppingBagIcon, title: t("commercialTitle"), body: t("commercialBody") },
    { value: "food", icon: UtensilsIcon, title: t("foodTitle"), body: t("foodBody") },
    { value: "unsure", icon: SparklesIcon, title: t("unsureTitle"), body: t("unsureBody") },
  ];
  return (
    <Fieldset id="segment" legend={t("title")} hint={t("intro")} error={errors.segment}>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(({ value, icon: Icon, title, body }) => (
          <OptionCard
            key={value}
            type="radio"
            name="segment"
            value={value}
            checked={state.segment === value}
            onChange={() => update((s) => setSegment(s, value, catalog))}
            onActivate={onPicked}
            media={
              <span className="flex h-full min-h-16 items-center justify-center bg-kraft-light">
                <Icon aria-hidden="true" className="size-7 text-forest" strokeWidth={1.6} />
              </span>
            }
            title={title}
            body={body}
          />
        ))}
      </div>
    </Fieldset>
  );
}

export function StepProduct() {
  const t = useTranslations("wizard.product");
  const tw = useTranslations("wizard");
  const te = useTranslations("enums.condition");
  const { state, update, errors } = useWizard();
  const p = state.product;
  const set = (patch: Partial<typeof p>) => update((s) => ({ ...s, product: { ...s.product, ...patch } }));
  return (
    <div className="space-y-6">
      <TextField
        id="product.name"
        label={t("name")}
        value={p.name}
        onChange={(name) => set({ name })}
        placeholder={t("namePlaceholder")}
        error={errors["product.name"]}
        maxLength={200}
      />
      <TextField
        id="product.contents"
        label={t("contents")}
        value={p.contents}
        onChange={(contents) => set({ contents })}
        placeholder={t("contentsPlaceholder")}
        optional
        maxLength={500}
      />
      <div>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <TextField
              id="product.weight"
              label={t("weight")}
              value={p.weight}
              onChange={(weight) => set({ weight })}
              inputMode="decimal"
              optional
              hint={t("weightHint")}
              error={errors["product.weight"]}
              maxLength={12}
            />
          </div>
          {/* alineado con el campo (debajo de la etiqueta), no con la ayuda ni el error */}
          <div className="w-24 pt-[26px]">
            <label htmlFor="product.weightUnit" className="sr-only">
              {t("unit")}
            </label>
            <select
              id="product.weightUnit"
              value={p.weightUnit}
              onChange={(e) => set({ weightUnit: e.target.value as "g" | "kg" })}
              className="block h-[46px] w-full rounded-md border border-input bg-paper px-2 text-base"
            >
              <option value="g">{t("unitG")}</option>
              <option value="kg">{t("unitKg")}</option>
            </select>
          </div>
        </div>
      </div>
      <Fieldset id="product.dims" legend={t("dims")} hint={t("dimsHint")} error={errors["product.dims"]} optional>
        <div className="grid grid-cols-3 gap-2">
          {(["length", "width", "height"] as const).map((k) => (
            <TextField
              key={k}
              id={`product.${k}`}
              label={t(k)}
              value={p[k]}
              onChange={(v) => set({ [k]: v })}
              inputMode="decimal"
              error={errors[`product.${k}`]}
              maxLength={7}
            />
          ))}
        </div>
      </Fieldset>
      <TextField id="product.volume" label={t("volume")} value={p.volume} onChange={(volume) => set({ volume })} placeholder={t("volumePlaceholder")} optional maxLength={100} />
      <Fieldset id="product.conditions" legend={t("conditions")} hint={t("conditionsHint")} optional>
        <CheckChips
          name="conditions"
          options={CONDITIONS.map((c) => ({ value: c, label: te(c) }))}
          selected={p.conditions}
          onToggle={(v, on) => set({ conditions: toggleIn(p.conditions, v, on) })}
        />
      </Fieldset>
      <Fieldset id="product.uses" legend={t("uses")} optional>
        <CheckChips
          name="uses"
          options={PRODUCT_USES.map((u) => ({ value: u, label: tw(`useOptions.${u}`) }))}
          selected={p.uses}
          onToggle={(v, on) => set({ uses: toggleIn(p.uses, v, on) })}
        />
      </Fieldset>
    </div>
  );
}
