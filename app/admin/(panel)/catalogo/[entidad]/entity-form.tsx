"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RefOption } from "@/lib/catalog/admin";
import { ENTITIES, type EntityKey, type FieldDef } from "@/lib/catalog/entities";
import { cn } from "@/lib/utils";
import { saveEntityAction, type FormState } from "../actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

type Props = {
  entityKey: EntityKey;
  id: string | null;
  initial: Record<string, unknown>;
  refOptions: Partial<Record<EntityKey, RefOption[]>>;
  canEdit: boolean;
};

export function EntityForm({ entityKey, id, initial, refOptions, canEdit }: Props) {
  const t = useTranslations("admin.catalog");
  const te = useTranslations("enums");
  const ta = useTranslations("admin");
  const def = ENTITIES[entityKey];
  const [state, action, pending] = useActionState<FormState, FormData>(saveEntityAction.bind(null, entityKey, id), { status: "idle" });

  useEffect(() => {
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  function enumLabel(field: { enumType: string }, value: string): string {
    if (field.enumType === "segment") return te(`segment.${value}` as "segment.food");
    if (field.enumType === "size_family") return te(`sizeFamily.${value}` as "sizeFamily.box");
    return te(`condition.${value}` as "condition.hot");
  }

  function hintFor(field: FieldDef): string | null {
    if (field.name === "code") return entityKey === "gallery_samples" ? t("hints.galleryCode") : t("hints.code");
    if (field.name === "slug") return t("hints.slug");
    if (field.name === "min_weight_g") return t("hints.weights");
    return null;
  }

  function control(field: FieldDef) {
    const value = initial[field.name];
    const describedBy = [fieldErrors[field.name] ? `${field.name}-error` : null, hintFor(field) ? `${field.name}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;
    const common = { id: field.name, name: field.name, disabled: !canEdit, "aria-invalid": fieldErrors[field.name] ? true : undefined, "aria-describedby": describedBy };
    switch (field.type) {
      case "text":
        return <Input {...common} defaultValue={(value as string | null) ?? ""} required={field.required} maxLength={field.maxLength} />;
      case "textarea":
        return <Textarea {...common} defaultValue={(value as string | null) ?? ""} rows={3} maxLength={field.maxLength} />;
      case "lines":
        return <Textarea {...common} defaultValue={Array.isArray(value) ? (value as string[]).join("\n") : ""} rows={3} />;
      case "number":
        return (
          <Input
            {...common}
            type="number"
            inputMode="decimal"
            step={field.step ?? (field.integer ? "1" : "any")}
            min={field.min}
            max={field.max}
            defaultValue={value === null || value === undefined ? "" : String(value)}
            required={field.required}
          />
        );
      case "boolean":
        return (
          <input
            {...common}
            type="checkbox"
            defaultChecked={Boolean(value)}
            className="size-4 rounded border-input accent-primary"
          />
        );
      case "enum":
        return (
          <select {...common} defaultValue={(value as string | null) ?? ""} className={selectClass} required={field.required}>
            {field.required ? null : <option value="">{t("none")}</option>}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {enumLabel(field, o)}
              </option>
            ))}
          </select>
        );
      case "ref": {
        const options = refOptions[field.ref] ?? [];
        return (
          <select {...common} defaultValue={(value as string | null) ?? ""} className={selectClass} required={field.required}>
            {field.required && value ? null : <option value="">{t("none")}</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code}
                {" · "}
                {o.name}
                {o.is_active ? "" : ` (${ta("inactive")})`}
              </option>
            ))}
          </select>
        );
      }
      case "enum-multi":
      case "ref-multi": {
        const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
        const options =
          field.type === "enum-multi"
            ? field.options.map((o) => ({ value: o, label: enumLabel(field, o) }))
            : (refOptions[field.ref] ?? []).map((o) => ({ value: o.id, label: `${o.code} · ${o.name}` }));
        return (
          <fieldset id={field.name} aria-describedby={describedBy} className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input px-3 py-2">
            <legend className="sr-only">{t(`fields.${field.name}` as "fields.code")}</legend>
            {options.map((o) => (
              <label key={o.value} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name={field.name} value={o.value} defaultChecked={selected.has(o.value)} disabled={!canEdit} className="size-4 accent-primary" />
                {o.label}
              </label>
            ))}
          </fieldset>
        );
      }
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        // Sin `action` en el form para que React no lo limpie si hay errores.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        {def.fields.map((field) => {
          const wide = field.type === "textarea" || field.type === "lines" || field.type === "enum-multi" || field.type === "ref-multi";
          const hint = hintFor(field);
          return (
            <div
              key={field.name}
              className={cn("space-y-1.5", wide && "md:col-span-2", field.type === "boolean" && "flex flex-row-reverse items-center justify-end gap-2 space-y-0")}
            >
              <Label htmlFor={field.name} className={field.type === "boolean" ? "font-normal" : undefined}>
                {t(`fields.${field.name}` as "fields.code")}
              </Label>
              {control(field)}
              {hint && field.type !== "boolean" ? (
                <p id={`${field.name}-hint`} className="text-xs text-muted-foreground">
                  {hint}
                </p>
              ) : null}
              {fieldErrors[field.name] ? (
                <p id={`${field.name}-error`} className="text-xs text-destructive">
                  {t(`errors.${fieldErrors[field.name]}` as "errors.required")}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {state.status === "error" && state.error && state.error !== "invalid" ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${state.error}` as "errors.generic")}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="submit" disabled={pending}>
          {pending ? t("actions.saving") : id ? t("actions.save") : t("actions.create")}
        </Button>
      ) : null}
    </form>
  );
}
