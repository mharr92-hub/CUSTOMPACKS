"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { editContactAction, editItemAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WizardContext, type WizardSettings } from "@/components/wizard/context";
import { StepQuantity } from "@/components/wizard/steps-order";
import { StepMaterial, StepPrint, StepSize, StepType } from "@/components/wizard/steps-piece";
import type { PublicCatalog } from "@/lib/catalog/public";
import type { FlowState } from "@/lib/quote/flow";
import type { ItemDraft } from "@/lib/quote/types";
import type { StepErrors } from "@/lib/quote/validate";

const noop = () => {};

/**
 * "Editar pieza" (M13): los mismos pasos del cotizador (tipo, tamaño,
 * material, impresión y cantidades), con el catálogo y las compatibilidades
 * de siempre. Guardar crea una versión nueva de la ficha con su motivo.
 */
export function EditItem({
  requestId,
  itemId,
  position,
  initial,
  catalog,
  settings,
  today,
}: {
  requestId: string;
  itemId: string;
  position: number;
  /** Estado del cotizador con esta pieza como única pieza. */
  initial: FlowState;
  catalog: PublicCatalog;
  settings: WizardSettings;
  today: string;
}) {
  const t = useTranslations("admin.edit");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FlowState>(initial);
  const [errors, setErrors] = useState<StepErrors>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = useCallback((fn: (s: FlowState) => FlowState) => setState((s) => fn(s)), []);
  const updateItem = useCallback((fn: (item: ItemDraft) => ItemDraft) => setState((s) => ({ ...s, items: s.items.map((it, i) => (i === 0 ? fn(it) : it)) })), []);
  const ctx = useMemo(
    () => ({ state, catalog, settings, errors, today, update, updateItem, draftToken: null, ensureSaved: async () => null, setUploading: noop }),
    [state, catalog, settings, errors, today, update, updateItem],
  );

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)} data-testid="edit-item-open">
        {t("editItem", { n: position })}
      </Button>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await editItemAction(requestId, itemId, { item: state.items[0], reason });
      if (result.ok) {
        toast.success(result.warning ? t(`warnings.${result.warning}`) : t("saved"));
        setOpen(false);
        setReason("");
        setErrors({});
        router.refresh();
      } else {
        setErrors(result.fields ?? {});
        setError(t(`errors.${result.error}`));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-6 rounded-md border-2 border-dashed border-forest/40 p-3" data-testid="edit-item">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <WizardContext.Provider value={ctx}>
        <section className="space-y-3">
          <h4 className="font-semibold">{t("sections.type")}</h4>
          <StepType onAddPiece={noop} />
        </section>
        {!state.items[0]?.needsAdvice ? (
          <>
            <section className="space-y-3">
              <h4 className="font-semibold">{t("sections.size")}</h4>
              <StepSize />
            </section>
            <section className="space-y-3">
              <h4 className="font-semibold">{t("sections.material")}</h4>
              <StepMaterial />
            </section>
            <section className="space-y-3">
              <h4 className="font-semibold">{t("sections.print")}</h4>
              <StepPrint onAddPiece={noop} />
            </section>
          </>
        ) : null}
        <section className="space-y-3">
          <h4 className="font-semibold">{t("sections.quantity")}</h4>
          <StepQuantity />
        </section>
      </WizardContext.Provider>
      <label className="grid gap-1 text-sm font-medium">
        {t("reason")}
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} placeholder={t("reasonPlaceholder")} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

export type ContactValues = { name: string; company: string; email: string; whatsapp: string; city: string; address: string };

/** Corregir el contacto y la entrega, con motivo (queda en el historial y en la auditoría). */
export function EditContact({ requestId, initial }: { requestId: string; initial: ContactValues }) {
  const t = useTranslations("admin.edit");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)} data-testid="edit-contact-open">
        {t("editContact")}
      </Button>
    );
  }
  const field = (key: keyof ContactValues) => (
    <label key={key} className="grid gap-1 text-xs font-medium">
      {t(`contact.${key}`)}
      <Input value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} maxLength={key === "address" ? 400 : 200} />
    </label>
  );
  return (
    <form
      className="mt-3 space-y-3 rounded-md border border-border p-3"
      data-testid="edit-contact"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await editContactAction(requestId, { ...v, reason });
          if (result.ok) {
            toast.success(t("saved"));
            setOpen(false);
            setReason("");
            router.refresh();
          } else setError(t(`errors.${result.error}`));
        } catch {
          setError(t("errors.generic"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">{(["name", "company", "whatsapp", "email", "city", "address"] as const).map(field)}</div>
      <label className="grid gap-1 text-xs font-medium">
        {t("reason")}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t("save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
