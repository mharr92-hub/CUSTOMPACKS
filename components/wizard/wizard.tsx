"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CloudIcon, CloudOffIcon, XIcon } from "lucide-react";
import { loadDraftAction, saveDraftAction, submitQuoteAction } from "@/app/cotizar/actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { track, trackLead } from "@/lib/analytics";
import type { PublicCatalog } from "@/lib/catalog/public";
import { addPiece, applyPreload, editPiece, goBack, goNext, goToStep, progress, removePiece, type FlowState, type Preload, type PreloadOutcome } from "@/lib/quote/flow";
import { resumeLink } from "@/lib/quote/links";
import { maxQuantityBucket, optionEvents } from "@/lib/quote/option-events";
import { hasContactData, type ItemDraft, type StepId, type WizardState } from "@/lib/quote/types";
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

/**
 * Sin consentimiento el servidor no guarda el contacto (D-033): al recuperar,
 * el contacto escrito en este dispositivo completa la versión del servidor.
 */
function withLocalContact(server: WizardState, local: WizardState | undefined): WizardState {
  if (!local || hasContactData(server.contact) || !hasContactData(local.contact)) return server;
  return { ...server, contact: local.contact };
}

export type WizardProps = {
  catalog: PublicCatalog;
  settings: WizardSettings;
  today: string;
  initialState: WizardState;
  initialToken: string | null;
  /** true si el estado vino del servidor (?borrador=): no se reemplaza por el local. */
  initialIsAuthoritative: boolean;
  /** Entrada desde una ficha o una muestra: se suma al borrador en curso, si lo hay. */
  preload: Preload | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";
type Notice = { outcome: Exclude<PreloadOutcome, "none">; piece: number; type: string | null; sample: string | null };

export function Wizard({ catalog, settings, today, initialState, initialToken, initialIsAuthoritative, preload }: WizardProps) {
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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [undo, setUndo] = useState<{ snapshot: FlowState; n: number } | null>(null);
  const stateRef = useRef(state);
  const tokenRef = useRef(initialToken);
  const dirtyRef = useRef(false);
  /** true tras enviar: no se vuelve a guardar el borrador. */
  const submittedRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  /** Al navegar desde "Ir al paso": mostrar y enfocar el primer error del paso destino. */
  const focusErrorsRef = useRef(false);
  const eventsFromRef = useRef<FlowState | null>(null);
  /** Datos de entrada para recuperar el borrador una sola vez por montaje (un refresh del servidor no lo repite). */
  const restoreInput = useRef({ initialIsAuthoritative, preload, catalog });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const ctx = useMemo(() => ({ catalog, today }), [catalog, today]);

  // Recupera el avance guardado en este dispositivo (y su versión en el
  // servidor) y le suma la pieza o muestra con la que se entró, si la hay.
  useEffect(() => {
    let cancelled = false;
    const { initialIsAuthoritative, preload, catalog } = restoreInput.current;
    async function restore() {
      try {
        if (initialIsAuthoritative) return;
        const local = readLocal();
        let base: WizardState | null = null;
        let baseToken: string | null = null;
        if (local?.token) {
          const server = await loadDraftAction(local.token);
          if (cancelled) return;
          if (server.status === "ok" && !server.submitted) {
            base = withLocalContact(server.state, local.state);
            baseToken = local.token;
          } else if (server.status === "ok") {
            clearLocal();
          } else if (local.state) {
            // "missing": el borrador venció (se crea otro); "error": se reintenta con el mismo token.
            base = local.state;
            baseToken = server.status === "error" ? local.token : null;
            dirtyRef.current = true;
          }
        } else if (local?.state) {
          base = local.state;
          dirtyRef.current = true;
        }
        if (!base) {
          if (preload) dirtyRef.current = true;
          return;
        }
        if (preload) {
          const merged = applyPreload(base, preload, catalog);
          base = merged.state;
          if (merged.outcome !== "none") {
            dirtyRef.current = true;
            setNotice({
              outcome: merged.outcome,
              piece: merged.piece + 1,
              type: catalog.productTypes.find((ty) => ty.id === base?.items[merged.piece]?.productTypeId)?.name ?? null,
              sample: catalog.gallery.find((g) => g.id === preload.sampleId)?.code ?? null,
            });
          }
        }
        setState(base);
        if (baseToken) {
          setToken(baseToken);
          tokenRef.current = baseToken;
        }
      } catch {
        // sin conexión: se sigue con lo que hay en pantalla y se guarda en este dispositivo
        dirtyRef.current = true;
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // La URL no guarda tokens ni precargas (D-032): el borrador vive en el
  // servidor y en este dispositivo.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (["borrador", "tipo", "muestra"].some((k) => url.searchParams.has(k))) window.history.replaceState(null, "", url.pathname);
  }, []);

  const saveNowRef = useRef<() => Promise<string | null>>(async () => null);
  const saveNow = useCallback(async (): Promise<string | null> => {
    if (submittedRef.current) return tokenRef.current;
    setSaveStatus("saving");
    const sent = stateRef.current;
    try {
      const result = await saveDraftAction(tokenRef.current, sent);
      if (!result.ok) {
        if (result.submitted) {
          submittedRef.current = true;
          clearLocal();
          setSaveStatus("idle");
          return null;
        }
        setSaveStatus("error");
        return null;
      }
      // Si hubo cambios mientras se guardaba, siguen pendientes.
      dirtyRef.current = stateRef.current !== sent;
      if (result.token !== tokenRef.current) {
        tokenRef.current = result.token;
        setToken(result.token);
      }
      setSaveStatus("saved");
      writeLocal(result.token, stateRef.current);
      return dirtyRef.current ? saveNowRef.current() : result.token;
    } catch {
      setSaveStatus("error");
      return null;
    }
  }, []);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  // Los guardados van en fila: dos guardados simultáneos de un borrador nuevo
  // crearían dos borradores distintos.
  const inflightRef = useRef<Promise<string | null> | null>(null);
  const persist = useCallback((): Promise<string | null> => {
    const previous = inflightRef.current;
    const run = (async () => {
      if (previous) await previous.catch(() => null);
      return saveNow();
    })();
    inflightRef.current = run;
    void run.finally(() => {
      if (inflightRef.current === run) inflightRef.current = null;
    });
    return run;
  }, [saveNow]);

  // Autoguardado: localStorage al instante, servidor 1,2 s después del último cambio.
  useEffect(() => {
    if (!ready || submittedRef.current) return;
    writeLocal(tokenRef.current, state);
    if (!dirtyRef.current) return;
    const timer = window.setTimeout(() => void persist(), 1200);
    return () => window.clearTimeout(timer);
  }, [state, ready, persist]);

  // Analítica: opción elegida en cada campo (códigos de catálogo, sin datos personales).
  useEffect(() => {
    if (!ready) return;
    const prev = eventsFromRef.current;
    eventsFromRef.current = state;
    if (!prev) return;
    for (const e of optionEvents(prev, state, catalog)) track("wizard_option", e);
  }, [state, ready, catalog]);

  // Al cambiar de paso (o de pieza en los pasos 2–5): foco en el título, arriba y evento.
  const pieceKey = state.step >= 2 && state.step <= 5 ? state.current : -1;
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      track("wizard_step_view", { step: state.step });
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    track("wizard_step_view", { step: state.step });
    if (focusErrorsRef.current) {
      focusErrorsRef.current = false;
      focusFirstError();
    }
  }, [state.step, pieceKey]);

  const update = useCallback((fn: (s: FlowState) => FlowState) => {
    dirtyRef.current = true;
    setBlocking(null);
    setState((s) => fn(s));
  }, []);

  /** Cambio de paso: los errores visibles no pasan de un paso a otro. */
  const navigate = useCallback(
    (fn: (s: FlowState) => FlowState, opts: { showErrors?: boolean } = {}) => {
      setShowErrors(Boolean(opts.showErrors));
      focusErrorsRef.current = Boolean(opts.showErrors);
      setUndo(null);
      setNotice(null);
      update(fn);
    },
    [update],
  );

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

  function stepCompleteParams(): Record<string, string | number> {
    if (state.step !== 6) return { step: state.step };
    const quantities = state.items.flatMap((it) => it.quantities.map(parseQuantity)).filter((q): q is number => typeof q === "number");
    return { step: 6, quantity: maxQuantityBucket(quantities.length ? Math.max(...quantities) : null) };
  }

  function onContinue() {
    if (state.step === 9) {
      void submit();
      return;
    }
    if (!stepIsValid()) return;
    track("wizard_step_complete", stepCompleteParams());
    navigate(goNext);
  }

  function onBack() {
    navigate(goBack);
  }

  function onPicked() {
    track("wizard_step_complete", { step: 0 });
    navigate(goNext);
  }

  /** "Agregar otra pieza" desde el paso 5 (o el 2 con "No sé, sugiéranme"). */
  function onAddPiece() {
    if (!stepIsValid()) return;
    track("wizard_step_complete", { step: state.step });
    track("wizard_add_piece", { pieces: state.items.length + 1 });
    navigate((s) => addPiece(s));
  }

  const summaryActions = {
    onEdit: (i: number) => navigate((s) => editPiece(s, i)),
    onGoTo: (step: StepId, item: number) => navigate((s) => goToStep({ ...s, current: item }, step), { showErrors: true }),
    onAddPiece: () => {
      track("wizard_add_piece", { pieces: state.items.length + 1, from: "summary" });
      navigate((s) => addPiece(s, { returnToSummary: true }));
    },
    onRemove: (i: number) => {
      setUndo({ snapshot: state, n: i + 1 });
      update((s) => removePiece(s, i));
    },
    onUndo: () => {
      if (!undo) return;
      const snapshot = undo.snapshot;
      setUndo(null);
      update(() => snapshot);
    },
  };

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
        router.push("/cotizar/listo");
        return;
      }
      if (result.reason === "invalid") setBlocking({ step: result.step, item: result.item });
      else setSubmitError(true);
    } catch {
      setSubmitError(true);
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
    const summary = [token ? t("preferTalkDraft", { link: resumeLink(token) }) : "", state.product.name ? `${state.product.name}.` : "", pieces]
      .filter(Boolean)
      .join(" ");
    return whatsappLink(t("preferTalkText", { brand: brand.name, summary }));
  }, [state, token, catalog, t]);

  const prog = progress(state);
  const pieceStep = state.step >= 2 && state.step <= 5;
  const StepBody = (() => {
    switch (state.step) {
      case 0:
        return <StepSegment onPicked={onPicked} />;
      case 1:
        return <StepProduct />;
      case 2:
        return <StepType onAddPiece={onAddPiece} />;
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
        return <StepSummary submitting={submitting} submitError={submitError} blocking={blocking} undo={undo} actions={summaryActions} />;
    }
  })();

  return (
    <WizardContext.Provider value={{ state, catalog, settings, errors, today, update, updateItem, draftToken: token, ensureSaved }}>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-32 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{t("progress", { index: prog.index, total: prog.total })}</p>
          <div className="flex items-center gap-1">
            <SaveStatusIcon status={saveStatus} />
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
        {/* Siempre montado para que los lectores de pantalla anuncien el primer cambio. */}
        <div role="status" className="mt-2 min-h-0 text-sm">
          {saveStatus === "error" ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-signal-yellow/15 px-3 py-2">
              <span>{t("saveError")}</span>
              <button type="button" onClick={() => void persist()} className="font-semibold text-forest underline underline-offset-4">
                {t("saveRetry")}
              </button>
            </p>
          ) : (
            <span className="sr-only">{saveStatus === "saving" ? t("saving") : saveStatus === "saved" ? t("saved") : ""}</span>
          )}
        </div>

        {notice ? (
          <div role="status" className="mt-3 flex items-start justify-between gap-3 rounded-md border border-forest/30 bg-forest/[0.05] px-3 py-2 text-sm">
            <p>{t(`preload.${notice.outcome}`, { n: notice.piece, type: notice.type ?? "", sample: notice.sample ?? "" })}</p>
            <button type="button" aria-label={t("preload.dismiss")} onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-muted">
              <XIcon className="size-4" />
            </button>
          </div>
        ) : null}

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

function focusFirstError() {
  window.requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = el.matches("input,select,textarea") ? el : el.querySelector<HTMLElement>("input:not([disabled]),select,textarea");
    focusable?.focus({ preventScroll: true });
  });
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  const t = useTranslations("wizard");
  if (status === "idle") return null;
  const label = status === "saving" ? t("saving") : status === "saved" ? t("saved") : t("saveErrorShort");
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      {status === "error" ? <CloudOffIcon aria-hidden="true" className="size-4 text-signal-yellow" /> : <CloudIcon aria-hidden="true" className="size-4" />}
      <span aria-hidden="true" className="hidden sm:inline">
        {label}
      </span>
    </span>
  );
}
