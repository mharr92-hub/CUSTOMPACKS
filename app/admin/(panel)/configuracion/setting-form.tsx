"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingAction, type FormState } from "../catalogo/actions";

export function SettingForm({
  settingKey,
  valueType,
  value,
}: {
  settingKey: string;
  valueType: "number" | "string" | "boolean" | "json";
  value: string;
}) {
  const t = useTranslations("admin.settings");
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingAction.bind(null, settingKey), { status: "idle" });
  useEffect(() => {
    if (state.status === "saved") toast.success(t("saved"));
  }, [state, t]);
  const id = `setting-${settingKey}`;
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <label htmlFor={id} className="sr-only">
        {settingKey}
      </label>
      <div className="flex items-start gap-2">
        {valueType === "boolean" ? (
          <select id={id} name="value" defaultValue={value} className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm">
            <option value="true">{t("boolTrue")}</option>
            <option value="false">{t("boolFalse")}</option>
          </select>
        ) : valueType === "json" ? (
          <Textarea id={id} name="value" defaultValue={value} rows={2} className="flex-1 font-mono text-xs" />
        ) : (
          <Input id={id} name="value" defaultValue={value} inputMode={valueType === "number" ? "decimal" : undefined} className="flex-1" />
        )}
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-xs text-destructive">
          {t("invalid")}
        </p>
      ) : null}
    </form>
  );
}
