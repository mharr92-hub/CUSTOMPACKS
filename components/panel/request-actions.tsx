"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { addNoteAction, assignAction, changeStatusAction, requestMissingDataAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { renderText } from "@/lib/notify/render";
import type { ActionResult } from "@/lib/panel/requests";
import { LOSS_REASONS, type RequestStatus } from "@/lib/states";

const select = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function useResult() {
  const t = useTranslations("admin.request");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        toast.success(t("saved"));
        onOk?.();
        router.refresh();
      } else setError(t(`errors.${result.error}`));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

/** Asignación: tomarla, dársela a alguien o al siguiente en turno. */
export function AssignControl({ requestId, assignedTo, staff }: { requestId: string; assignedTo: string | null; staff: { userId: string; name: string }[] }) {
  const t = useTranslations("admin.request");
  const { error, busy, run } = useResult();
  const [to, setTo] = useState(assignedTo ?? "");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void run(() => assignAction(requestId, "me"))}>
          {t("takeIt")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => assignAction(requestId, "next"))}>
          {t("nextInTurn")}
        </Button>
      </div>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="assign-to">
          {t("assignSelect")}
        </label>
        <select id="assign-to" value={to} onChange={(e) => setTo(e.target.value)} className={select}>
          <option value="">{t("nobody")}</option>
          {staff.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => assignAction(requestId, to || "none"))}>
          {t("assign")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Cambio de estado: solo los pasos válidos de §14; Rechazada exige motivo de pérdida. */
export function StatusControl({ requestId, next }: { requestId: string; next: readonly RequestStatus[] }) {
  const t = useTranslations("admin.request");
  const ta = useTranslations("admin");
  const { error, busy, run } = useResult();
  const [to, setTo] = useState<RequestStatus | "">(next[0] ?? "");
  const [reason, setReason] = useState("");
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");
  if (next.length === 0) return <p className="text-sm text-muted-foreground">{t("noTransitions")}</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!to) return;
        void run(() => changeStatusAction(requestId, to, { reason, lossReason, lossNote }), () => {
          setReason("");
          setLossNote("");
        });
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        {t("to")}
        <select value={to} onChange={(e) => setTo(e.target.value as RequestStatus)} className={select} data-testid="status-select">
          {next.map((s) => (
            <option key={s} value={s}>
              {ta(`statuses.${s}`)}
            </option>
          ))}
        </select>
      </label>
      {to === "rejected" ? (
        <>
          <label className="grid gap-1 text-xs font-medium">
            {t("lossReason")}
            <select value={lossReason} onChange={(e) => setLossReason(e.target.value)} className={select}>
              <option value="">{t("chooseLoss")}</option>
              {LOSS_REASONS.map((r) => (
                <option key={r} value={r}>
                  {ta(`lossReasons.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            {t("lossNote")}
            <Textarea value={lossNote} onChange={(e) => setLossNote(e.target.value)} rows={2} maxLength={1000} />
          </label>
        </>
      ) : (
        <label className="grid gap-1 text-xs font-medium">
          {t("reason")}
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} />
        </label>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={busy || !to}>
        {t("apply")}
      </Button>
    </form>
  );
}

/**
 * "Pedir datos faltantes": la lista sale del semáforo y se puede ajustar; la
 * vista previa muestra el WhatsApp que recibirá el cliente con esa lista.
 */
export function MissingDataControl({ requestId, available, defaultList, template, vars }: { requestId: string; available: boolean; defaultList: string; template: string; vars: Record<string, string> }) {
  const t = useTranslations("admin.request");
  const { error, busy, run } = useResult();
  const [list, setList] = useState(defaultList);
  if (!available) return <p className="text-sm text-muted-foreground">{t("missingUnavailable")}</p>;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => requestMissingDataAction(requestId, list));
      }}
    >
      <p className="text-xs text-muted-foreground">{t("missingHint")}</p>
      <label className="grid gap-1 text-xs font-medium">
        {t("missingList")}
        <Textarea value={list} onChange={(e) => setList(e.target.value)} rows={3} maxLength={1000} data-testid="missing-list" />
      </label>
      <div>
        <p className="text-xs font-medium">{t("missingPreview")}</p>
        <p className="mt-1 rounded-lg rounded-tl-none bg-[#dcf8c6] p-2 text-xs whitespace-pre-line text-ink">{renderText(template, { ...vars, lista: list })}</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={busy || list.trim().length < 3}>
        {t("missingSend")}
      </Button>
    </form>
  );
}

/** Nota interna o registro de un contacto con el cliente (regla de oro de §11). */
export function NoteForm({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.request");
  const { error, busy, run } = useResult();
  const [channel, setChannel] = useState("note");
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => addNoteAction(requestId, { channel, body }), () => setBody(""));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <label className="grid gap-1 text-xs font-medium">
          {t("noteChannel")}
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={select}>
            {(["note", "whatsapp", "email", "call"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`channels.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("noteBody")}
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={4000} placeholder={t("notePlaceholder")} />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={busy || body.trim().length < 2}>
        {t("addNote")}
      </Button>
    </form>
  );
}
