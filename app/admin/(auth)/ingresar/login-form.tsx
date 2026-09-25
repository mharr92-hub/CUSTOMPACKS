"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginLinkAction, type LoginState } from "@/app/admin/actions";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("admin.login");
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLinkAction, { status: "idle" });
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? "email-error" : undefined}
        />
        {state.status === "error" ? (
          <p id="email-error" className="text-sm text-destructive">
            {state.error === "rate_limited" ? t("rateLimited") : t("invalidEmail")}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("sending") : t("submit")}
      </Button>
      {state.status === "sent" ? (
        <div role="status" className="space-y-3 rounded-md bg-accent px-3 py-3 text-sm">
          <p>{t("sent")}</p>
          {state.devLink ? (
            <div className="border-t border-border pt-3">
              <p className="font-semibold">{t("devLinkTitle")}</p>
              <p className="text-muted-foreground">{t("devLinkBody")}</p>
              <a href={state.devLink} className="mt-2 inline-block font-medium text-primary underline underline-offset-4">
                {t("devLinkOpen")}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
