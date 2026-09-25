"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloudIcon, CloudOffIcon } from "lucide-react";
import { loadDraftAction, saveDraftAction, submitQuoteAction } from "@/app/cotizar/actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { track, trackLead } from "@/lib/analytics";
import type { PublicCatalog } from "@/lib/catalog/public";
import { addPiece, goBack, goNext, progress, type FlowState } from "@/lib/quote/flow";
import { resumeLink } from "@/lib/quote/links";
import type { ItemDraft, StepId, WizardState } from "@/lib/quote/types";
import { parseQuantity, validateAll, validateStep } from "@/lib/quote/validate";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { WizardContext, type WizardSettings } from "./context";
import { SaveLater } from "./save-later";
import { StepSummary } from "./step-summary";
import { StepProduct, StepSegment } from "./steps-intro";
import { StepArtwork, StepContact, StepQuantity } from "./steps-order";
import { StepMaterial, StepPrint, StepSize, StepType } from "./steps-piece";

const LOCAL_KEY = "provenpack:cotizador";

type LocalDraft = { token: string | null; state: WizardState; savedAt: string };

function readLocal(): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

function writeLocal(token: string | null, state: WizardState) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ token, state, savedAt: new Date().toISOString() }));
  } catch {
    // almacenamiento lleno o bloqueado: el servidor sigue siendo la fuente de verdad
  }
}

function clearLocal() {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignorar
  }
}

export type WizardProps = {
  catalog: PublicCatalog;
  settings: WizardSettings;
  today: string;
  initialState: WizardState;
  initialToken: string | null;
  /** true si el estado vino del servidor (?borrador=) o de una ficha/muestra; no se reemplaza por el local. */
  initialIsAuthoritative: boolean;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function Wizard({ catalog, settings, today, initialState, initialToken, initialIsAuthoritative }: WizardProps) {
  const t = useTranslations("wizard");
  const router = useRouter();
  const [state, setState] = useState<FlowState>(initialState);
  const [token, setToken] = useState<string | null>(initialToken);
  const [showErrors, setShowErrors] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [blocking, setBlocking] = useState<{ step: StepId; item: number } | null>(null);
  const stateRef = useRef(state);
  const tokenRef = useRef(initialToken);
  const dirtyRef = useRef(false);
  /** true tras enviar: no se vuelve a guardar el borrador. */
  const submittedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const ctx = useMemo(() => ({ catalog, today }), [catalog, today]);

  // Recupera el avance guardado en este dispositivo (y su versión en el servidor).
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (initialIsAuthoritative) {
        await Promise.resolve();
      } else {
        const local = readLocal();
        if (local?.token) {
          const server = await loadDraftAction(local.token);
          if (cancelled) return;
          if (server && !server.submitted) {
            setState(server.state);
            setToken(local.token);
            tokenRef.current = local.token;
          } else if (server?.submitted) {
            clearLocal();
          } else if (local.state) {
            setState(local.state);
            dirtyRef.current = true;
          }
        } else if (local?.state) {
          await Promise.resolve();
          setState(local.state);
          dirtyRef.current = true;
        }
      }
      if (!cancelled) setReady(true);
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [initialIsAuthoritative]);

  const persist = useCallback(async (): Promise<string | null> => {
    if (submittedRef.current) return tokenRef.current;
    setSaveStatus("saving");
    const result = await saveDraftAction(tokenRef.current, stateRef.current);
    if (!result.ok) {
      if (result.submitted) {
        submittedRef.current = true;
        clearLocal();
        setSaveStatus("idle");
        return null;
      }
      setSaveStatus("error");
      return tokenRef.current;
    }
    dirtyRef.current = false;
    if (result.token !== tokenRef.current) {
      tokenRef.current = result.token;
      setToken(result.token);
      if (window.location.pathname === "/cotizar") window.history.replaceState(null, "", `/cotizar?borrador=${result.token}`);
    }
    setSaveStatus("saved");
    writeLocal(result.token, stateRef.current);
    return result.token;
  }, []);

  // Autoguardado: localStorage al instante, servidor 1,2 s después del último cambio.
  useEffect(() => {
    if (!ready || submittedRef.current) return;
    writeLocal(tokenRef.current, state);
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => void persist(), 1200);
    return () => window.clearTimeout(timer);
  }, [state, ready, persist]);

  // Al cambiar de paso: foco en el título (lectores de pantalla), arriba y evento.
  const currentPiece = state.current;
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      track("wizard_step_view", { step: state.step });
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    track("wizard_step_view", { step: state.step });
  }, [state.step, currentPiece]);

  const update = useCallback((fn: (s: FlowState) => FlowState) => {
    dirtyRef.current = true;
    setBlocking(null);
    setState((s) => fn(s));
  }, []);

  const updateItem = useCallback(
    (fn: (item: ItemDraft) => ItemDraft, index?: number) => {
      update((s) => {
        const target = index ?? s.current;
        return { ...s, items: s.items.map((it, i) => (i === target ? fn(it) : it)) };
      });
    },
    [update],
  );

  const errors = useMemo(() => (showErrors ? validateStep(state, state.step, ctx) : {}), [showErrors, state, ctx]);

  function focusFirstError() {
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const focusable = el.matches("input,select,textarea") ? el : el.querySelector<HTMLElement>("input:not([disabled]),select,textarea");
      focusable?.focus({ preventScroll: true });
    });
  }

  function stepIsValid(): boolean {
    const e = validateStep(state, state.step, ctx);
    if (Object.keys(e).length > 0) {
      setShowErrors(true);
      focusFirstError();
      track("wizard_step_error", { step: state.step, fields: Object.keys(e).join(",") });
      return false;
    }
    setShowErrors(false);
    return true;
  }

  function onContinue() {
    if (state.step === 9) {
      void submit();
      return;
    }
    if (!stepIsValid()) return;
    track("wizard_step_complete", { step: state.step });
    update(goNext);
  }

  function onBack() {
    setShowErrors(false);
    update(goBack);
  }

  function onAddPiece() {
    if (!stepIsValid()) return;
    track("wizard_add_piece", { pieces: state.items.length + 1 });
    update(addPiece);
  }

  async function ensureSaved(): Promise<string | null> {
    if (dirtyRef.current || !tokenRef.current) return persist();
    return tokenRef.current;
  }

  async function submit() {
    setSubmitError(false);
    const check = validateAll(state, ctx);
    if (!check.ok) {
      setBlocking({ step: check.step, item: check.item });
      return;
    }
    setSubmitting(true);
    try {
      const saved = await ensureSaved();
      if (!saved) {
        setSubmitError(true);
        return;
      }
      const result = await submitQuoteAction(saved);
      if (result.ok) {
        submittedRef.current = true;
        dirtyRef.current = false;
        clearLocal();
        trackLead({ pieces: state.items.length });
        track("wizard_submit", { pieces: state.items.length, minutes: Math.round((Date.now() - Date.parse(state.startedAt)) / 60000) });
        router.push(`/cotizar/listo/${result.accessToken}`);
        return;
      }
      if (result.reason === "invalid") setBlocking({ step: result.step, item: result.item });
      else setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  // "Prefiero hablar": WhatsApp con el resumen parcial y el enlace del borrador.
  const talkHref = useMemo(() => {
    const pieces = state.items
      .map((it, i) => {
        const type = catalog.productTypes.find((ty) => ty.id === it.productTypeId)?.name;
        const qty = it.quantities.map(parseQuantity).filter((q): q is number => typeof q === "number");
        const qtyText = qty.length ? ` (${qty.map((q) => new Intl.NumberFormat("es-PA").format(q)).join(" / ")})` : "";
        return type ? `${t("piece", { n: i + 1 })}: ${type}${qtyText}.` : null;
      })
      .filter(Boolean)
      .join(" ");
    const summary = [state.product.name ? `${state.product.name}.` : "", pieces, token ? t("preferTalkDraft", { link: resumeLink(token) }) : ""]
      .filter(Boolean)
      .join(" ");
    return whatsappLink(t("preferTalkText", { brand: brand.name, summary }));
  }, [state, token, catalog, t]);

  const prog = progress(state);
  const pieceStep = state.step >= 2 && state.step <= 5;
  const StepBody = (() => {
    switch (state.step) {
      case 0:
        return <StepSegment onPicked={() => update(goNext)} />;
      case 1:
        return <StepProduct />;
      case 2:
        return <StepType />;
      case 3:
        return <StepSize />;
      case 4:
        return <StepMaterial />;
      case 5:
        return <StepPrint onAddPiece={onAddPiece} />;
      case 6:
        return <StepQuantity />;
      case 7:
        return <StepArtwork />;
      case 8:
        return <StepContact />;
      case 9:
        return <StepSummary submitting={submitting} submitError={submitError} blocking={blocking} />;
    }
  })();

  return (
    <WizardContext.Provider value={{ state, catalog, settings, errors, today, update, updateItem }}>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-32 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("progress", { index: prog.index, total: prog.total })}</p>
          <div className="flex items-center gap-1">
            <SaveStatusBadge status={saveStatus} />
            <SaveLater token={token} ensureSaved={ensureSaved} defaultEmail={state.contact.email} />
            <Button asChild variant="ghost" size="sm">
              <a href={talkHref} target="_blank" rel="noopener noreferrer" onClick={() => track("wizard_prefer_talk", { step: state.step })}>
                <WhatsAppIcon className="size-4 text-[#1f8f4e]" />
                {t("preferTalk")}
              </a>
            </Button>
          </div>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={prog.total}
          aria-valuenow={prog.index}
          aria-label={t("progress", { index: prog.index, total: prog.total })}
        >
          <div className="h-full rounded-full bg-forest transition-[width] duration-300" style={{ width: `${prog.pct}%` }} />
        </div>

        <div className="mt-6">
          {pieceStep && state.items.length > 1 ? (
            <p className="mb-1 text-sm font-semibold text-kraft-dark">{t("pieceOf", { n: state.current + 1, total: state.items.length })}</p>
          ) : null}
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-[-0.02em] outline-none sm:text-4xl">
            {t(`steps.${state.step}`)}
          </h1>
        </div>

        {showErrors && Object.keys(errors).length > 0 ? (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {t("errorsTitle")}
          </p>
        ) : null}

        <div className="mt-6">{StepBody}</div>
      </div>

      <nav
        aria-label={t("progress", { index: prog.index, total: prog.total })}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-paper/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          {state.step > 0 ? (
            <Button type="button" variant="ghost" size="lg" onClick={onBack} className="h-12">
              <ArrowLeftIcon className="size-4" />
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="lg" onClick={onContinue} disabled={submitting} className={cn("h-12 min-w-40 px-6 text-base", state.step === 9 && "min-w-48")}>
            {state.step === 9 ? (submitting ? t("summary.submitting") : t("summary.submit")) : t("continue")}
            {state.step === 9 ? <CheckIcon className="size-4" /> : <ArrowRightIcon className="size-4" />}
          </Button>
        </div>
      </nav>
    </WizardContext.Provider>
  );
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const t = useTranslations("wizard");
  if (status === "idle") return null;
  const label = status === "saving" ? t("saving") : status === "saved" ? t("saved") : t("saveError");
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status" title={label}>
      {status === "error" ? <CloudOffIcon className="size-4 text-signal-yellow" /> : <CloudIcon className="size-4" />}
      <span className="sr-only sm:not-sr-only">{status === "error" ? "" : label}</span>
    </span>
  );
}

