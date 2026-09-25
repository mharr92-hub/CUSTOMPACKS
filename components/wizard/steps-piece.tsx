"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LightbulbIcon, PlusIcon } from "lucide-react";
import { CodePlaceholder } from "@/components/catalog/code-placeholder";
import { Button } from "@/components/ui/button";
import { annotateCalibers, annotatePapers, suggestCaliberByWeight, type CompatDecision } from "@/lib/compat";
import { MAX_PIECES, setItemPaper, setItemPrint, setItemType } from "@/lib/quote/flow";
import { PRINT_COVERAGES, PRINT_FACES, type SizeMode } from "@/lib/quote/types";
import { needsFoodAttributes, parseWeightGrams, typeFitsSegment } from "@/lib/quote/validate";
import { cn } from "@/lib/utils";
import { useCurrentItem, useWizard } from "./context";
import { CheckChips, Fieldset, OptionCard, SuggestedBadge, TextField, toggleIn } from "./fields";

function Thumb({ photoUrl, code, variant }: { photoUrl: string | null; code: string; variant: "box" | "bag" | "food_box" }) {
  return photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura pequeña; las fotos ya son optimizadas por el CDN
    <img src={photoUrl} alt="" loading="lazy" className="aspect-[4/3] h-full w-full object-cover" />
  ) : (
    <span className="block aspect-[4/3] h-full w-full">
      <CodePlaceholder code={code} variant={variant} showCode={false} />
    </span>
  );
}

/** Foto de una opción técnica (papel, calibre, tamaño, impresión) si el catálogo la tiene. */
function OptionPhoto({ photoUrl }: { photoUrl: string | null }) {
  if (!photoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element -- miniatura pequeña; las fotos ya son optimizadas por el CDN
  return <img src={photoUrl} alt="" loading="lazy" className="aspect-[4/3] h-full w-full object-cover" />;
}

/** "Agregar otra pieza" (paso 5, o paso 2 cuando la pieza queda a sugerencia del equipo). */
function AddPieceBlock({ onAddPiece }: { onAddPiece: () => void }) {
  const t = useTranslations("wizard.print");
  const { state } = useWizard();
  if (state.items.length >= MAX_PIECES) return null;
  return (
    <div className="rounded-lg border-2 border-dashed border-forest/40 p-4">
      <p className="text-sm text-muted-foreground">{t("addPieceHint")}</p>
      <Button type="button" variant="outline" className="mt-3" onClick={onAddPiece}>
        <PlusIcon className="size-4" />
        {t("addPiece")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 2 · Tipo de empaque
// ---------------------------------------------------------------------------
export function StepType({ onAddPiece }: { onAddPiece: () => void }) {
  const t = useTranslations("wizard.type");
  const { state, catalog, updateItem, errors } = useWizard();
  const item = useCurrentItem();
  const segment = state.segment;
  // Primero los tipos propios del segmento elegido (p. ej. empaque de comida para un restaurante).
  const types = catalog.productTypes
    .filter((ty) => typeFitsSegment(ty.segments, segment))
    .map((ty, i) => ({ ty, rank: segment && ty.segments.length === 1 && ty.segments[0] === segment ? 0 : 1, i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ ty }) => ty);
  const categories = catalog.categories.filter((c) => types.some((ty) => ty.categoryId === c.id));
  const [category, setCategory] = useState<string | "all">(() => {
    const current = types.find((ty) => ty.id === item.productTypeId);
    return current?.categoryId ?? "all";
  });
  const visible = types.filter((ty) => category === "all" || ty.categoryId === category);

  return (
    <div className="space-y-6">
      <Fieldset id="type" legend={t("title")} hint={t("intro")} error={errors.type}>
        <div role="group" aria-label={t("filterLabel")} className="mb-4 flex flex-wrap gap-2">
          {[{ id: "all", name: t("allCategories") }, ...categories].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "min-h-10 rounded-full border px-3.5 py-1.5 text-sm",
                category === c.id ? "border-forest bg-forest text-paper" : "border-border bg-paper hover:border-forest/50",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((ty) => (
            <OptionCard
              key={ty.id}
              type="radio"
              name="productType"
              value={ty.id}
              checked={!item.needsAdvice && item.productTypeId === ty.id}
              onChange={() => updateItem((it) => setItemType(it, ty.id, catalog))}
              media={<Thumb photoUrl={ty.photoUrl} code={ty.code} variant={ty.sizeFamily} />}
              title={ty.name}
              body={ty.typicalUses.slice(0, 2).join(" · ")}
            />
          ))}
          <OptionCard
            type="radio"
            name="productType"
            value="advice"
            checked={item.needsAdvice}
            onChange={() => updateItem((it) => ({ ...it, needsAdvice: true, productTypeId: null }))}
            media={
              <span className="flex aspect-[4/3] items-center justify-center bg-kraft-light">
                <LightbulbIcon aria-hidden="true" className="size-7 text-forest" strokeWidth={1.6} />
              </span>
            }
            title={t("adviceTitle")}
            body={t("adviceBody")}
            className="border-dashed"
          />
        </div>
      </Fieldset>
      {item.needsAdvice ? <AddPieceBlock onAddPiece={onAddPiece} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 3 · Tamaño
// ---------------------------------------------------------------------------
export function StepSize() {
  const t = useTranslations("wizard.size");
  const tp = useTranslations("wizard.product");
  const { state, catalog, updateItem, errors } = useWizard();
  const item = useCurrentItem();
  const type = catalog.productTypes.find((ty) => ty.id === item.productTypeId);
  const sizes = catalog.sizes.filter((s) => !type || s.family === type.sizeFamily);
  const fmt = (n: number) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(n);
  const p = state.product;
  const productDims = [p.length, p.width, p.height].every((v) => v.trim()) ? `${p.length} × ${p.width} × ${p.height} cm` : null;
  const modes: { value: SizeMode; title: string; body: string }[] = [
    { value: "standard", title: t("standard"), body: t("standardBody") },
    { value: "custom", title: t("custom"), body: t("customBody") },
    { value: "by_product", title: t("byProduct"), body: t("byProductBody") },
  ];
  return (
    <div className="space-y-6">
      <Fieldset id="size" legend={t("title")} hint={t("intro")} error={errors.size}>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map((m) => (
            <OptionCard
              key={m.value}
              type="radio"
              name="sizeMode"
              value={m.value}
              checked={item.sizeMode === m.value}
              onChange={() => updateItem((it) => ({ ...it, sizeMode: m.value }))}
              title={m.title}
              body={m.body}
            />
          ))}
        </div>
      </Fieldset>

      {item.sizeMode === "standard" ? (
        <Fieldset id="standardSize" legend={t("standard")} error={errors.standardSize}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sizes.map((s) => (
              <OptionCard
                key={s.id}
                type="radio"
                name="standardSize"
                value={s.id}
                checked={item.standardSizeId === s.id}
                onChange={() => updateItem((it) => ({ ...it, standardSizeId: s.id }))}
                media={s.photoUrl ? <OptionPhoto photoUrl={s.photoUrl} /> : undefined}
                title={<span className="tabular">{t("sizeOption", { name: s.name, l: fmt(s.lengthCm), w: fmt(s.widthCm), h: fmt(s.heightCm) })}</span>}
                className="p-3"
              />
            ))}
          </div>
        </Fieldset>
      ) : null}

      {item.sizeMode === "custom" ? (
        <div>
          <div className="grid grid-cols-3 gap-2">
            {(["length", "width", "height"] as const).map((k) => (
              <TextField
                key={k}
                id={k}
                label={tp(k)}
                value={item[k]}
                onChange={(v) => updateItem((it) => ({ ...it, [k]: v }))}
                inputMode="decimal"
                error={errors[k]}
                maxLength={7}
              />
            ))}
          </div>
          <p className="mt-3 rounded-md bg-kraft-light px-3 py-2 text-sm">{t("customWarning")}</p>
        </div>
      ) : null}

      {item.sizeMode === "by_product" ? (
        <p className="rounded-md bg-kraft-light px-3 py-2 text-sm">
          {productDims ? t("byProductWithDims", { dims: productDims }) : t("byProductNoDims")}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 4 · Material
// ---------------------------------------------------------------------------
function decisionNote(decision: CompatDecision, t: (k: "requires" | "blockedReason") => string): string | undefined {
  if (decision.allowed) return undefined;
  return decision.reason ?? (decision.kind === "requires" ? t("requires") : t("blockedReason"));
}

export function StepMaterial() {
  const t = useTranslations("wizard.material");
  const tw = useTranslations("wizard");
  const { state, catalog, updateItem, errors } = useWizard();
  const item = useCurrentItem();
  const typeId = item.productTypeId ?? "";
  const conditions = state.product.conditions;
  const papers = annotatePapers(catalog.compatibilities, typeId, catalog.papers);
  const calibers = annotateCalibers(catalog.compatibilities, typeId, item.paperId, catalog.calibers);
  const weight = parseWeightGrams(state.product.weight, state.product.weightUnit);
  const suggestedCaliber = suggestCaliberByWeight(catalog.calibers, typeof weight === "number" ? weight : null);
  const foodRequired = needsFoodAttributes(item, state.segment, catalog);
  const suggestedFood = catalog.foodAttributes.filter((f) => f.suggestedForConditions.some((c) => conditions.includes(c))).map((f) => f.id);

  return (
    <div className="space-y-7">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-dashed border-border bg-paper p-3.5 has-[:checked]:border-forest has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest">
        <input
          type="checkbox"
          checked={item.materialAdvice}
          onChange={(e) => updateItem((it) => ({ ...it, materialAdvice: e.target.checked, ...(e.target.checked ? { paperId: null, caliberId: null } : {}) }))}
          className="mt-1 size-4 accent-forest"
        />
        <span>
          <span className="font-semibold">{t("advice")}</span>
          {item.materialAdvice ? <span className="mt-0.5 block text-sm text-muted-foreground">{t("adviceOn")}</span> : null}
        </span>
      </label>

      {!item.materialAdvice ? (
        <>
          <Fieldset id="paper" legend={t("paper")} error={errors.paper}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {papers.map((p) => {
                const suggested = p.suggestedForConditions.some((c) => conditions.includes(c));
                return (
                  <OptionCard
                    key={p.id}
                    type="radio"
                    name="paper"
                    value={p.id}
                    checked={item.paperId === p.id}
                    disabled={!p.decision.allowed}
                    onChange={() => updateItem((it) => setItemPaper(it, p.id, catalog))}
                    media={p.photoUrl ? <OptionPhoto photoUrl={p.photoUrl} /> : undefined}
                    title={p.name}
                    badge={suggested && p.decision.allowed ? <SuggestedBadge>{t("suggestedByConditions")}</SuggestedBadge> : undefined}
                    body={decisionNote(p.decision, t) ?? p.description ?? undefined}
                  />
                );
              })}
            </div>
          </Fieldset>

          <Fieldset id="caliber" legend={t("caliber")} error={errors.caliber} hint={item.paperId ? undefined : t("caliberNeedsPaper")}>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {calibers.map((c) => (
                <OptionCard
                  key={c.id}
                  type="radio"
                  name="caliber"
                  value={c.id}
                  checked={item.caliberId === c.id}
                  disabled={!c.decision.allowed}
                  onChange={() => updateItem((it) => ({ ...it, caliberId: c.id }))}
                  media={c.photoUrl ? <OptionPhoto photoUrl={c.photoUrl} /> : undefined}
                  title={c.name}
                  badge={suggestedCaliber?.id === c.id && c.decision.allowed ? <SuggestedBadge>{t("suggestedByWeight")}</SuggestedBadge> : undefined}
                  body={decisionNote(c.decision, t) ?? c.simpleLabel ?? undefined}
                />
              ))}
            </div>
          </Fieldset>
        </>
      ) : null}

      {catalog.ecoAttributes.length > 0 ? (
        <Fieldset id="eco" legend={t("eco")} optional>
          <CheckChips
            name="eco"
            options={catalog.ecoAttributes.map((a) => ({ value: a.id, label: a.name }))}
            selected={item.ecoIds}
            onToggle={(v, on) => updateItem((it) => ({ ...it, ecoIds: toggleIn(it.ecoIds, v, on) }))}
          />
        </Fieldset>
      ) : null}

      <Fieldset
        id="food"
        legend={t("food")}
        hint={foodRequired ? t("foodRequired") : undefined}
        error={errors.food}
        optional={!foodRequired}
      >
        <CheckChips
          name="food"
          options={catalog.foodAttributes.map((a) => ({ value: a.id, label: a.name }))}
          selected={item.foodIds}
          suggested={suggestedFood}
          suggestedLabel={tw("suggested")}
          onToggle={(v, on) => updateItem((it) => ({ ...it, foodIds: toggleIn(it.foodIds, v, on) }))}
        />
      </Fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso 5 · Impresión y acabados
// ---------------------------------------------------------------------------
export function StepPrint({ onAddPiece }: { onAddPiece: () => void }) {
  const t = useTranslations("wizard.print");
  const tw = useTranslations("wizard");
  const { catalog, updateItem, errors } = useWizard();
  const item = useCurrentItem();
  const opt = catalog.printOptions.find((p) => p.id === item.printOptionId);
  const printing = Boolean(opt && !opt.isNoPrint);
  return (
    <div className="space-y-7">
      <Fieldset id="print" legend={t("title")} hint={t("intro")} error={errors.print}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {catalog.printOptions.map((p) => (
            <OptionCard
              key={p.id}
              type="radio"
              name="printOption"
              value={p.id}
              checked={item.printOptionId === p.id}
              onChange={() => updateItem((it) => setItemPrint(it, p.id, catalog))}
              media={p.photoUrl ? <OptionPhoto photoUrl={p.photoUrl} /> : undefined}
              title={p.name}
              body={p.description ?? undefined}
            />
          ))}
        </div>
      </Fieldset>

      {opt?.requiresPantone ? (
        <TextField
          id="pantone"
          label={t("pantone")}
          value={item.pantone}
          onChange={(pantone) => updateItem((it) => ({ ...it, pantone }))}
          placeholder={t("pantonePlaceholder")}
          hint={t("pantoneHint")}
          error={errors.pantone}
          maxLength={200}
        />
      ) : null}

      {printing ? (
        <>
          <Fieldset id="faces" legend={t("faces")} error={errors.faces}>
            <div className="grid grid-cols-3 gap-2">
              {PRINT_FACES.map((f) => (
                <OptionCard
                  key={f}
                  type="radio"
                  name="faces"
                  value={f}
                  checked={item.faces === f}
                  onChange={() => updateItem((it) => ({ ...it, faces: f }))}
                  title={tw(`facesOptions.${f}`)}
                  className="p-3"
                />
              ))}
            </div>
          </Fieldset>
          <Fieldset id="coverage" legend={t("coverage")} error={errors.coverage}>
            <div className="grid grid-cols-3 gap-2">
              {PRINT_COVERAGES.map((c) => (
                <OptionCard
                  key={c}
                  type="radio"
                  name="coverage"
                  value={c}
                  checked={item.coverage === c}
                  onChange={() => updateItem((it) => ({ ...it, coverage: c }))}
                  title={tw(`coverageOptions.${c}`)}
                  className="p-3"
                />
              ))}
            </div>
          </Fieldset>
        </>
      ) : null}

      {catalog.finishes.length > 0 ? (
        <Fieldset id="finishes" legend={t("finishes")} optional>
          <CheckChips
            name="finishes"
            options={catalog.finishes.map((f) => ({ value: f.id, label: f.name }))}
            selected={item.finishIds}
            onToggle={(v, on) => updateItem((it) => ({ ...it, finishIds: toggleIn(it.finishIds, v, on) }))}
          />
        </Fieldset>
      ) : null}

      <AddPieceBlock onAddPiece={onAddPiece} />
    </div>
  );
}
