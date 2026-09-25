"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { sendResumeLinkAction } from "@/app/cotizar/actions";
import { brand } from "@/config/brand";
import { track } from "@/lib/analytics";
import { resumeLink } from "@/lib/quote/links";
import { isValidEmail } from "@/lib/quote/validate";
import { whatsappLink } from "@/lib/whatsapp";

/** "Guardar y seguir después": enlace del borrador por correo o WhatsApp (PRD §8). */
export function SaveLater({ token, ensureSaved, defaultEmail }: { token: string | null; ensureSaved: () => Promise<string | null>; defaultEmail: string }) {
  const t = useTranslations("wizard");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [link, setLink] = useState<string | null>(token ? resumeLink(token) : null);
  const [copied, setCopied] = useState(false);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      track("wizard_save_later_open");
      const saved = await ensureSaved();
      setLink(saved ? resumeLink(saved) : null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    const saved = await ensureSaved();
    if (!saved) {
      setStatus("error");
      return;
    }
    const result = await sendResumeLinkAction(saved, email);
    setStatus(result.ok ? "sent" : "error");
    track("wizard_save_later_email", { ok: result.ok });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <BookmarkIcon className="size-4" />
          <span className="hidden sm:inline">{t("saveLater")}</span>
          <span className="sr-only sm:hidden">{t("saveLater")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("saveLaterTitle")}</DialogTitle>
          <DialogDescription>{t("saveLaterBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="space-y-3" noValidate>
          <label htmlFor="save-later-email" className="block text-sm font-semibold">
            {t("saveLaterEmail")}
          </label>
          <input
            id="save-later-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setStatus("idle");
            }}
            aria-invalid={status === "error" || undefined}
            aria-describedby={status === "error" ? "save-later-error" : undefined}
            className="block w-full rounded-md border border-input px-3 py-2.5 text-base aria-invalid:border-destructive"
          />
          {status === "error" ? (
            <p id="save-later-error" className="text-sm text-destructive">
              {t("errors.emailInvalid")}
            </p>
          ) : null}
          {status === "sent" ? (
            <p role="status" className="text-sm font-medium text-signal-green">
              {t("saveLaterSent")}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={status === "sending"}>
            {status === "sending" ? t("saving") : t("saveLaterSend")}
          </Button>
        </form>
        {link ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
            <Button asChild variant="outline" className="flex-1">
              <a
                href={whatsappLink(t("saveLaterWhatsappText", { brand: brand.name, link }))}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("wizard_save_later_whatsapp")}
              >
                {t("saveLaterWhatsapp")}
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t("saveLaterCopied") : t("saveLaterCopy")}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
