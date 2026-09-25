"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import type { ErrorKey } from "@/lib/quote/validate";
import { cn } from "@/lib/utils";

/** Mensaje de error de un campo (texto de wizard.errors). */
export function FieldError({ id, error }: { id: string; error?: ErrorKey }) {
  const t = useTranslations("wizard.errors");
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-destructive" data-field-error>
      {t(error)}
    </p>
  );
}

export function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const inputBase =
  "block w-full rounded-md border border-input bg-paper px-3 py-2.5 text-base shadow-xs outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive";

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  optional,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  multiline,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: ErrorKey;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url" | "date";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  const t = useTranslations("wizard");
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">{`(${t("optional")})`}</span> : null}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputBase, "mt-1.5 min-h-24")}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputBase, "mt-1.5")}
        />
      )}
      {hint ? <Hint id={`${id}-hint`}>{hint}</Hint> : null}
      <FieldError id={`${id}-error`} error={error} />
    </div>
  );
}

/** Tarjeta seleccionable (radio o checkbox nativo, accesible con teclado). */
export function OptionCard({
  type,
  name,
  value,
  checked,
  disabled,
  onChange,
  title,
  body,
  badge,
  media,
  className,
  onActivate,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  badge?: React.ReactNode;
  media?: React.ReactNode;
  className?: string;
  /**
   * Se llama al tocar o hacer clic en la tarjeta, aunque ya estuviera marcada
   * (avanzar en pasos de una sola opción). Con teclado no: las flechas solo
   * cambian la opción y se avanza con "Continuar" (WCAG 3.2.2).
   */
  onActivate?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Momento del último toque o clic sobre la tarjeta. */
  const pointerAt = useRef(Number.NEGATIVE_INFINITY);
  const byPointer = () => performance.now() - pointerAt.current < 1000;
  return (
    <label
      onPointerDown={onActivate ? () => (pointerAt.current = performance.now()) : undefined}
      onClick={
        onActivate
          ? (e) => {
              // El clic que el navegador reenvía al input no cuenta dos veces.
              if (e.target === inputRef.current || !checked) return;
              if (byPointer()) onActivate();
              pointerAt.current = Number.NEGATIVE_INFINITY;
            }
          : undefined
      }
      className={cn(
        "relative flex cursor-pointer gap-3 rounded-lg border-2 border-border bg-paper p-3.5 transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest",
        checked && "border-forest bg-forest/[0.04]",
        disabled ? "cursor-not-allowed opacity-55" : "hover:border-forest/50",
        className,
      )}
    >
      <input
        ref={inputRef}
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
          if (e.target.checked && onActivate && byPointer()) {
            pointerAt.current = Number.NEGATIVE_INFINITY;
            onActivate();
          }
        }}
        className="sr-only"
      />
      {media ? <span className="w-20 shrink-0 overflow-hidden rounded-md sm:w-24">{media}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-snug">{title}</span>
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center border-2",
              type === "radio" ? "rounded-full" : "rounded",
              checked ? "border-forest bg-forest text-paper" : "border-input",
            )}
          >
            {checked ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
          </span>
        </span>
        {badge ? <span className="mt-1 block">{badge}</span> : null}
        {body ? <span className="mt-1 block text-sm text-muted-foreground">{body}</span> : null}
      </span>
    </label>
  );
}

/** Chips de selección múltiple (checkbox nativo). */
export function CheckChips<T extends string>({
  name,
  options,
  selected,
  onToggle,
  suggested = [],
  suggestedLabel,
}: {
  name: string;
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T, checked: boolean) => void;
  suggested?: readonly T[];
  suggestedLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest",
              checked ? "border-forest bg-forest text-paper" : "border-border bg-paper hover:border-forest/50",
            )}
          >
            <input type="checkbox" name={name} value={o.value} checked={checked} onChange={(e) => onToggle(o.value, e.target.checked)} className="sr-only" />
            {checked ? <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
            {o.label}
            {suggested.includes(o.value) && suggestedLabel ? (
              <span className={cn("ml-1 rounded-sm px-1.5 text-[11px] font-semibold", checked ? "bg-paper/20" : "bg-kraft-light text-kraft-dark")}>{suggestedLabel}</span>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}

export function Fieldset({
  legend,
  hint,
  error,
  id,
  children,
  optional,
}: {
  legend: string;
  hint?: string;
  error?: ErrorKey;
  id: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  const t = useTranslations("wizard");
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-semibold">
        {legend}
        {optional ? <span className="ml-1 font-normal text-muted-foreground">{`(${t("optional")})`}</span> : null}
      </legend>
      {hint ? <Hint id={`${id}-hint`}>{hint}</Hint> : null}
      <div className="mt-2.5">{children}</div>
      <FieldError id={`${id}-error`} error={error} />
    </fieldset>
  );
}

export function SuggestedBadge({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-sm bg-kraft-light px-1.5 py-0.5 text-xs font-semibold text-kraft-dark">{children}</span>;
}

export function toggleIn<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? (list.includes(value) ? [...list] : [...list, value]) : list.filter((v) => v !== value);
}
