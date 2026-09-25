"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leadTimeDaysForQuantities } from "@/lib/leadtime";
import { MAX_PIECES } from "@/lib/quote/flow";
import { itemSpecFromDraft, specRows, type SpecTranslator } from "@/lib/quote/spec";
import { parseQuantity } from "@/lib/quote/validate";
import type { StepId } from "@/lib/quote/types";
import { useWizard } from "./context";

export function SpecTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-3 py-2 sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="font-medium break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type SummaryActions = {
  onEdit: (index: number) => void;
  onGoTo: (step: StepId, item: number) => void;
  onAddPiece: () => void;
  onRemove: (index: number) => void;
  onUndo: () => void;
};

/** Lleva el foco (y la vista) a un aviso que acaba de aparecer, para que no quede fuera de pantalla. */
function useRevealOnChange(ref: React.RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    if (!key || !ref.current) return;
    ref.current.scrollIntoView({ block: "center", behavior: "smooth" });
    ref.current.focus({ preventScroll: true });
  }, [ref, key]);
}

export function StepSummary({
  submitting,
  submitError,
  blocking,
  undo,
  actions,
}: {
  submitting: boolean;
  submitError: boolean;
  blocking: { step: StepId; item: number } | null;
  undo: { n: number } | null;
  actions: SummaryActions;
}) {
  const t = useTranslations("wizard.summary");
  const tw = useTranslations("wizard");
  const ts = useTranslations("spec");
  const { state, catalog, settings } = useWizard();
  const blockingRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useRevealOnChange(blockingRef, blocking);
  useRevealOnChange(errorRef, submitError);
  useRevealOnChange(undoRef, undo);

  const specT: SpecTranslator = (key, values) => ts(key as "none", values as never);
  const specs = state.items.map((item, i) => itemSpecFromDraft(item, i, state, catalog));
  const quantities = state.items.flatMap((it) => it.quantities.map(parseQuantity)).map((q) => (typeof q === "number" ? q : null));
  const days = leadTimeDaysForQuantities(quantities, settings.leadTime);
  const c = state.contact;
  const general = [
    { label: t("segment"), value: state.segment ? tw(`segmentOptions.${state.segment}`) : ts("none") },
    { label: t("desiredDate"), value: state.desiredDate || ts("none") },
    { label: t("delivery"), value: [c.address, c.city].filter(Boolean).join(", ") || ts("none") },
    { label: t("contact"), value: [c.name, c.company, c.whatsapp, c.email].filter(Boolean).join(" · ") },
  ];

  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">{t("intro")}</p>

      {blocking ? (
        <div
          ref={blockingRef}
          tabIndex={-1}
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4 outline-none"
        >
          <p className="font-medium">{t("fixStep", { step: tw(`steps.${blocking.step}`) })}</p>
          <Button type="button" variant="outline" onClick={() => actions.onGoTo(blocking.step, blocking.item)}>
            {t("goToStep")}
          </Button>
        </div>
      ) : null}

      {undo ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
          <p>{t("removed", { n: undo.n })}</p>
          <Button ref={undoRef} type="button" variant="outline" size="sm" onClick={actions.onUndo}>
            <Undo2Icon className="size-4" />
            {t("undo")}
          </Button>
        </div>
      ) : null}

      {specs.map((spec, i) => (
        <section key={state.items[i]?.key ?? i} aria-labelledby={`summary-piece-${i}`} className="rounded-lg border border-border">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
            <h3 id={`summary-piece-${i}`} className="font-bold">
              {tw("piece", { n: i + 1 })}
              {spec.type ? `: ${spec.type.name}` : spec.needsAdvice ? `: ${tw("type.adviceTitle")}` : ""}
            </h3>
            <div className="flex gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => actions.onEdit(i)} aria-label={t("editPiece", { n: i + 1 })}>
                <PencilIcon className="size-4" />
                {t("edit")}
              </Button>
              {state.items.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => actions.onRemove(i)} aria-label={t("removePiece", { n: i + 1 })}>
                  <Trash2Icon className="size-4" />
                  {t("remove")}
                </Button>
              ) : null}
            </div>
          </header>
          <div className="px-4 py-2">
            <SpecTable rows={specRows(spec, specT)} />
          </div>
        </section>
      ))}

      {state.items.length < MAX_PIECES ? (
        <Button type="button" variant="outline" onClick={actions.onAddPiece}>
          <PlusIcon className="size-4" />
          {tw("print.addPiece")}
        </Button>
      ) : null}

      <section aria-labelledby="summary-general" className="rounded-lg border border-border">
        <h3 id="summary-general" className="border-b border-border bg-muted/50 px-4 py-3 font-bold">
          {t("general")}
        </h3>
        <div className="px-4 py-2">
          <SpecTable rows={general} />
        </div>
      </section>

      <section aria-labelledby="summary-conditions" className="rounded-lg bg-kraft-light p-4">
        <h3 id="summary-conditions" className="font-bold">
          {t("conditionsTitle")}
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>{t("conditionsPayment", { deposit: settings.depositPct, balance: 100 - settings.depositPct })}</li>
          {days ? <li>{t("conditionsLeadTime", { days })}</li> : null}
          <li>{t("conditionsQuote")}</li>
        </ul>
      </section>

      {submitError ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive outline-none">
          {t("submitError")}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {submitting ? t("submitting") : ""}
      </p>
    </div>
  );
}
