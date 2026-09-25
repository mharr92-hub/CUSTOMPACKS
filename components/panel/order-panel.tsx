"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  confirmEvidenceUploadAction,
  prepareEvidenceUploadAction,
  receiptUrlAction,
  recordMilestoneAction,
  recordPaymentAction,
  reviewPaymentAction,
  updateShippingAction,
} from "@/app/admin/(panel)/pedidos/[id]/actions";
import { EvidenceList, type EvidenceItem } from "@/components/orders/evidence-list";
import { FileUploader } from "@/components/upload/file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format";
import type { QaPoint, QaResult } from "@/lib/orders/qa";
import { formatMoney } from "@/lib/quotes/pricing";

const MAX_EVIDENCE = 30;
import { cn } from "@/lib/utils";

type MilestoneType = "deposit_received" | "artwork_approved" | "production_started" | "qa_completed" | "shipped" | "in_customs" | "delivered" | "balance_received" | "closed";

export type PanelEvidence = EvidenceItem;
export type PanelMilestone = { id: string; type: MilestoneType; occurredAt: string; responsible: string | null; notes: string | null; evidence: PanelEvidence[]; qa: QaPoint[] | null };
export type PanelPayment = {
  id: string;
  kind: "deposit" | "balance";
  status: "pending" | "confirmed" | "rejected";
  amount: number | null;
  currency: string;
  method: string | null;
  reference: string | null;
  hasReceipt: boolean;
  paidOn: string | null;
  uploadedByClient: boolean;
  notes: string | null;
  createdAt: string;
};

type Result = { ok: true } | { ok: false; error: string };

const RESULTS: readonly QaResult[] = ["ok", "observed", "na"];
const field = "h-9 rounded-md border border-input bg-background px-2 text-sm";
const day = (d: string) => formatDate(`${d}T17:00:00Z`);

function useRun() {
  const t = useTranslations("admin.order");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<Result>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        toast.success(t("saved"));
        onOk?.();
        router.refresh();
      } else {
        const key = `errors.${result.error}` as "errors.generic";
        setError(t.has(key) ? t(key) : t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

async function openSigned(fn: () => Promise<string | null>) {
  const win = window.open("", "_blank");
  const url = await fn();
  if (win && url) {
    win.opener = null;
    win.location.href = url;
  } else win?.close();
}

// ---------------------------------------------------------------------------
// Línea de tiempo con evidencias
// ---------------------------------------------------------------------------
export function OrderTimeline({ orderId, milestones, canEdit, maxMb }: { orderId: string; milestones: PanelMilestone[]; canEdit: boolean; maxMb: number }) {
  const t = useTranslations("admin.order");
  const router = useRouter();
  if (milestones.length === 0) return <p className="text-sm text-muted-foreground">{t("noMilestones")}</p>;
  return (
    <ol className="space-y-4 border-l-2 border-dashed border-forest/40 pl-5" data-testid="order-timeline">
      {milestones.map((m) => (
        <li key={m.id} className="relative" data-testid={`milestone-${m.type}`}>
          <span aria-hidden="true" className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-forest" />
          <p className="font-semibold">{t(`milestoneTypes.${m.type}`)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(m.occurredAt)}
            {m.responsible ? ` · ${t("responsible", { name: m.responsible })}` : ""}
          </p>
          {m.notes ? <p className="mt-1 text-sm whitespace-pre-line">{m.notes}</p> : null}
          {m.qa ? (
            <ul className="mt-2 space-y-1 text-sm">
              {m.qa.map((p) => (
                <li key={p.key}>
                  <span className="font-medium">{p.label}</span>: {p.expected} ·{" "}
                  <span className={cn(p.result === "observed" && "font-semibold text-signal-red")}>{p.result ? t(`qaResults.${p.result}`) : "—"}</span>
                  {p.comment ? ` · ${p.comment}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <EvidenceList evidence={m.evidence} alt={t("evidenceAlt", { milestone: t(`milestoneTypes.${m.type}`) })} videoLabel={t("video")} fileLabel={t("file")} />
          {canEdit ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-forest">{t("uploadEvidence")}</summary>
              <div className="mt-2">
                <FileUploader
                  label={t("evidence")}
                  hint={t("evidenceHint")}
                  accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.pdf,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf"
                  extensions={["jpg", "jpeg", "png", "webp", "mp4", "mov", "pdf"]}
                  maxMb={maxMb}
                  maxFiles={MAX_EVIDENCE}
                  currentCount={m.evidence.length}
                  limitsText={t("evidenceLimits", { max: maxMb, files: MAX_EVIDENCE })}
                  testId={`evidence-upload-${m.type}`}
                  requestSlot={(file) => prepareEvidenceUploadAction(m.id, { name: file.name, size: file.size })}
                  confirm={(input) => confirmEvidenceUploadAction(orderId, m.id, input)}
                  onUploaded={() => router.refresh()}
                />
              </div>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Registrar hito (siguiente paso válido; QA con checklist; embarque con guía)
// ---------------------------------------------------------------------------
export function RecordMilestoneForm({ orderId, options, qa, today }: { orderId: string; options: MilestoneType[]; qa: QaPoint[]; today: string }) {
  const t = useTranslations("admin.order");
  const { error, busy, run } = useRun();
  const idBase = useId();
  const [type, setType] = useState<MilestoneType | "">(options[0] ?? "");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [transport, setTransport] = useState("");
  const [tracking, setTracking] = useState("");
  const [eta, setEta] = useState("");
  const [points, setPoints] = useState<{ key: string; result: QaResult | null; comment: string }[]>(qa.map((p) => ({ key: p.key, result: null, comment: "" })));

  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t("noNext")}</p>;
  const setPoint = (key: string, patch: Partial<{ result: QaResult; comment: string }>) => setPoints((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  return (
    <form
      className="space-y-3"
      data-testid="milestone-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!type) return;
        void run(
          () => recordMilestoneAction(orderId, { type, occurredAt: date, notes, qa: type === "qa_completed" ? points : undefined, transport, tracking, eta }),
          () => {
            setNotes("");
            setTransport("");
            setTracking("");
            setEta("");
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          {t("milestone")}
          <select value={type} onChange={(e) => setType(e.target.value as MilestoneType)} className={field} name="type">
            {options.map((o) => (
              <option key={o} value={o}>
                {t(`milestoneTypes.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("date")}
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {type === "shipped" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">
            {t("transport")}
            <Input value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("tracking")}
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={200} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {t("eta")}
            <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          </label>
        </div>
      ) : null}
      {type === "qa_completed" ? (
        <label className="grid gap-1 text-sm font-medium sm:max-w-xs">
          {t("shipEstimate")}
          <Input type="date" value={eta} min={today} onChange={(e) => setEta(e.target.value)} />
        </label>
      ) : null}
      {type === "qa_completed" ? (
        <fieldset className="rounded-md border border-border p-3" data-testid="qa-checklist">
          <legend className="px-1 text-sm font-semibold">{t("qaTitle")}</legend>
          <ul className="divide-y divide-border">
            {qa.map((p) => {
              const current = points.find((x) => x.key === p.key);
              return (
                <li key={p.key} className="grid gap-2 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{t("qaExpected", { value: p.expected })}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label={p.label}>
                    {RESULTS.map((r) => (
                      <label key={r} className="inline-flex items-center gap-1.5 text-sm">
                        <input type="radio" name={`${idBase}-${p.key}`} value={r} checked={current?.result === r} onChange={() => setPoint(p.key, { result: r })} className="size-4 accent-forest" />
                        {t(`qaResults.${r}`)}
                      </label>
                    ))}
                  </div>
                  {current?.result === "observed" ? (
                    <Input
                      className="sm:col-span-2"
                      aria-label={`${t("qaComment")}: ${p.label}`}
                      placeholder={t("qaComment")}
                      value={current.comment}
                      onChange={(e) => setPoint(p.key, { comment: e.target.value })}
                      maxLength={500}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
      <label className="grid gap-1 text-sm font-medium">
        {t("notes")}
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} />
      </label>
      <ErrorLine error={error} />
      <Button type="submit" disabled={busy || !type}>
        {t("record")}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Envío y notas internas
// ---------------------------------------------------------------------------
export function ShippingForm({ orderId, initial }: { orderId: string; initial: { transport: string; tracking: string; eta: string; notes: string } }) {
  const t = useTranslations("admin.order");
  const { error, busy, run } = useRun();
  const [v, setV] = useState(initial);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateShippingAction(orderId, v));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium">
          {t("transport")}
          <Input value={v.transport} onChange={(e) => setV({ ...v, transport: e.target.value })} maxLength={200} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("tracking")}
          <Input value={v.tracking} onChange={(e) => setV({ ...v, tracking: e.target.value })} maxLength={200} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("eta")}
          <Input type="date" value={v.eta} onChange={(e) => setV({ ...v, eta: e.target.value })} />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        {t("internalNotes")}
        <Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={4000} rows={3} />
      </label>
      <ErrorLine error={error} />
      <Button type="submit" variant="outline" disabled={busy}>
        {t("saveShipping")}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pagos: lista, revisión de comprobantes y registro
// ---------------------------------------------------------------------------
function ReviewReceipt({ orderId, payment, suggested, today }: { orderId: string; payment: PanelPayment; suggested: string; today: string }) {
  const t = useTranslations("admin.order");
  const { error, busy, run } = useRun();
  const [amount, setAmount] = useState(suggested);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/50 p-3" data-testid="review-receipt">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium">
          {t("amount")}
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("method")}
          <Input value={method} placeholder={t("methodPlaceholder")} onChange={(e) => setMethod(e.target.value)} maxLength={80} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("reference")}
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("paidOn")}
          <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => reviewPaymentAction(orderId, payment.id, { decision: "confirm", amount, method, reference, paidOn }))}>
          {t("confirm")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => reviewPaymentAction(orderId, payment.id, { decision: "reject" }))}>
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}

function RecordPaymentForm({ orderId, defaultKind, suggested, today }: { orderId: string; defaultKind: "deposit" | "balance"; suggested: Record<"deposit" | "balance", string>; today: string }) {
  const t = useTranslations("admin.order");
  const { error, busy, run } = useRun();
  const [kind, setKind] = useState<"deposit" | "balance">(defaultKind);
  const [amount, setAmount] = useState(suggested[defaultKind]);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  return (
    <form
      className="space-y-2"
      data-testid="payment-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => recordPaymentAction(orderId, { kind, amount, method, reference, paidOn }));
      }}
    >
      <p className="text-sm font-semibold">{t("recordPayment")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium">
          {t("kind")}
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value === "balance" ? "balance" : "deposit";
              setKind(k);
              setAmount(suggested[k]);
            }}
            className={field}
            name="kind"
          >
            <option value="deposit">{t("kinds.deposit")}</option>
            <option value="balance">{t("kinds.balance")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("amount")}
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} name="amount" />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("method")}
          <Input value={method} placeholder={t("methodPlaceholder")} onChange={(e) => setMethod(e.target.value)} maxLength={80} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("reference")}
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("paidOn")}
          <Input type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      <ErrorLine error={error} />
      <Button type="submit" size="sm" disabled={busy}>
        {t("save")}
      </Button>
    </form>
  );
}

export function PaymentsPanel({
  orderId,
  payments,
  canEdit,
  suggested,
  defaultKind,
  today,
}: {
  orderId: string;
  payments: PanelPayment[];
  canEdit: boolean;
  suggested: Record<"deposit" | "balance", string>;
  defaultKind: "deposit" | "balance";
  today: string;
}) {
  const t = useTranslations("admin.order");
  return (
    <div className="space-y-4" data-testid="payments-panel">
      {payments.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {payments.map((p) => (
            <li key={p.id} className="p-3 text-sm" data-testid={`payment-${p.status}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`kinds.${p.kind}`)}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-medium",
                    p.status === "confirmed" ? "bg-signal-green/15" : p.status === "pending" ? "bg-signal-yellow/20" : "bg-signal-red/15",
                  )}
                >
                  {t(`paymentStatuses.${p.status}`)}
                </span>
                {p.amount !== null ? <span className="tabular">{formatMoney(p.amount, p.currency)}</span> : null}
                {p.uploadedByClient ? <span className="text-xs text-muted-foreground">{t("byClient")}</span> : null}
                {p.hasReceipt ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void openSigned(() => receiptUrlAction(p.id))}>
                    {t("receipt")}
                  </Button>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[p.paidOn ? day(p.paidOn) : formatDateTime(p.createdAt), p.method, p.reference].filter(Boolean).join(" · ")}
              </p>
              {canEdit && p.status === "pending" ? <ReviewReceipt orderId={orderId} payment={p} suggested={suggested[p.kind]} today={today} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? <RecordPaymentForm orderId={orderId} defaultKind={defaultKind} suggested={suggested} today={today} /> : null}
    </div>
  );
}
