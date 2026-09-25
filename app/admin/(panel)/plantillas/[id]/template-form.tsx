"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderHtml, renderText, templateVariables } from "@/lib/notify/render";
import { saveTemplateAction } from "../actions";

/** Edición de una plantilla con vista previa en vivo (datos de ejemplo). */
export function TemplateForm({
  id,
  channel,
  subject: initialSubject,
  body: initialBody,
  isActive: initialActive,
  variables,
  samples,
  canEdit,
}: {
  id: string;
  channel: "email" | "whatsapp";
  subject: string;
  body: string;
  isActive: boolean;
  variables: string[];
  samples: Record<string, string>;
  canEdit: boolean;
}) {
  const t = useTranslations("admin.templates");
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [isActive, setIsActive] = useState(initialActive);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unknown = [...new Set([...templateVariables(body), ...templateVariables(subject)])].filter((v) => !variables.includes(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await saveTemplateAction(id, { subject, body, isActive });
      if (result.ok) toast.success(t("saved"));
      else setError(result.error === "unknown_vars" ? t("errors.unknown_vars", { vars: (result.vars ?? []).join(", ") }) : t(`errors.${result.error}`));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={save} className="space-y-4">
        {channel === "email" ? (
          <div>
            <label htmlFor="tpl-subject" className="block text-sm font-semibold">
              {t("subject")}
            </label>
            <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} disabled={!canEdit} className="mt-1.5" />
          </div>
        ) : null}
        <div>
          <label htmlFor="tpl-body" className="block text-sm font-semibold">
            {t("body")}
          </label>
          <Textarea id="tpl-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000} disabled={!canEdit} className="mt-1.5" />
        </div>
        <div>
          <p className="text-sm font-semibold">{t("variables")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <li key={v}>
                <code className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">{`{${v}}`}</code>
              </li>
            ))}
          </ul>
        </div>
        {unknown.length ? (
          <p role="alert" className="text-sm text-destructive">
            {t("errors.unknown_vars", { vars: unknown.join(", ") })}
          </p>
        ) : null}
        {canEdit ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 accent-forest" />
              {t("active")}
            </label>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={saving || unknown.length > 0}>
              {t("save")}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        )}
      </form>
      <section aria-labelledby="tpl-preview" className="rounded-lg border border-border bg-card p-4">
        <h2 id="tpl-preview" className="font-semibold">
          {t("preview")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("previewHint")}</p>
        {channel === "email" ? (
          <>
            <p className="mt-4 text-sm">
              <span className="text-muted-foreground">{t("subject")}</span>
              {": "}
              <strong>{renderText(subject, samples)}</strong>
            </p>
            {/* HTML del correo con valores de ejemplo escapados por renderHtml. */}
            <div className="mt-3 space-y-3 rounded-md bg-muted/50 p-3 text-sm [&_a]:text-forest [&_a]:underline" dangerouslySetInnerHTML={{ __html: renderHtml(body, samples) }} />
          </>
        ) : (
          <p className="mt-4 rounded-lg rounded-tl-none bg-[#dcf8c6] p-3 text-sm whitespace-pre-line text-ink" data-testid="whatsapp-preview">
            {renderText(body, samples)}
          </p>
        )}
      </section>
    </div>
  );
}
