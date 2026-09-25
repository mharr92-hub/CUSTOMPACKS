"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { clientReplyAction } from "@/app/seguimiento/[token]/actions";
import { Button } from "@/components/ui/button";

/** "Nos faltan datos": el cliente ve la lista exacta y responde desde su enlace (queda en la solicitud). */
export function PendingReply({ token, list }: { token: string; list: string | null }) {
  const t = useTranslations("tracking.pending");
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error" | "empty">("idle");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) {
      setState("empty");
      return;
    }
    setState("sending");
    try {
      const result = await clientReplyAction(token, text);
      if (result.ok) {
        setState("sent");
        setText("");
        router.refresh();
      } else setState(result.error === "body" ? "empty" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <section aria-labelledby="pending-title" className="mt-6 rounded-lg border-2 border-signal-yellow bg-signal-yellow/10 p-5" data-testid="pending-reply">
      <h2 id="pending-title" className="text-lg font-bold">
        {t("title")}
      </h2>
      {list ? (
        <>
          <p className="mt-1 text-sm">{t("intro")}</p>
          <p className="mt-1 font-medium whitespace-pre-line">{list}</p>
        </>
      ) : null}
      {state === "sent" ? (
        <p role="status" className="mt-4 font-medium text-signal-green">
          {t("sent")}
        </p>
      ) : (
        <form onSubmit={send} className="mt-4 space-y-2" noValidate>
          <label htmlFor="pending-text" className="block text-sm font-semibold">
            {t("reply")}
          </label>
          <textarea
            id="pending-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (state !== "sending") setState("idle");
            }}
            rows={4}
            maxLength={4000}
            aria-describedby="pending-hint"
            className="block w-full rounded-md border border-input bg-paper px-3 py-2.5 text-base"
          />
          <p id="pending-hint" className="text-xs text-muted-foreground">
            {t("replyHint")}
          </p>
          {state === "error" || state === "empty" ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state === "empty" ? t("empty") : t("error")}
            </p>
          ) : null}
          <Button type="submit" disabled={state === "sending"}>
            {state === "sending" ? t("sending") : t("send")}
          </Button>
        </form>
      )}
    </section>
  );
}
