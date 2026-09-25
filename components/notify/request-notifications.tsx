"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MailIcon } from "lucide-react";
import { markWhatsappSentAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  templateCode: string;
  templateName: string;
  audience: "client" | "team";
  channel: "email" | "whatsapp";
  recipient: string;
  status: "queued" | "sent" | "simulated" | "failed";
  subject: string | null;
  body: string | null;
  waLink: string | null;
  error: string | null;
  createdAt: string;
  manualSentAt: string | null;
};

const TONE: Record<NotificationRow["status"], string> = {
  queued: "bg-muted",
  sent: "bg-forest/10 text-forest",
  simulated: "bg-kraft-light text-kraft-dark",
  failed: "bg-destructive/10 text-destructive",
};

/**
 * Registro de notificaciones de la solicitud (§12). Los WhatsApp del MVP son
 * click-to-chat: el equipo abre el mensaje precargado y lo marca enviado.
 */
export function RequestNotifications({ requestId, rows, canEdit }: { requestId: string; rows: NotificationRow[]; canEdit: boolean }) {
  const t = useTranslations("admin.notifications");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-testid="notifications">
      {rows.map((n) => (
        <li key={n.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]" data-testid="notification">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {n.channel === "email" ? <MailIcon aria-hidden="true" className="size-4 text-muted-foreground" /> : <WhatsAppIcon className="size-4 text-[#1f8f4e]" />}
              <span className="font-medium">{n.templateName}</span>
              <span className="text-muted-foreground">{t(`audience.${n.audience}`)}</span>
              <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-semibold", TONE[n.status])} data-testid="notification-status">
                {t(`status.${n.status}`)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {n.recipient}
              {" · "}
              {formatDateTime(n.createdAt)}
              {n.manualSentAt ? ` · ${t("manualSent", { date: formatDateTime(n.manualSentAt) })}` : ""}
            </p>
            {n.error ? <p className="mt-1 text-xs text-destructive">{n.error}</p> : null}
            {n.body ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-forest">{t("showText")}</summary>
                {n.subject ? <p className="mt-1 text-xs font-semibold">{n.subject}</p> : null}
                <p className="mt-1 text-xs whitespace-pre-line">{n.body}</p>
              </details>
            ) : null}
          </div>
          {n.channel === "whatsapp" && n.waLink && n.status === "simulated" && canEdit ? (
            <div className="flex flex-wrap items-start gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={n.waLink} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" />
                  {t("openWhatsapp")}
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy === n.id}
                onClick={async () => {
                  setBusy(n.id);
                  try {
                    if (await markWhatsappSentAction(requestId, n.id)) router.refresh();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {t("markSent")}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
