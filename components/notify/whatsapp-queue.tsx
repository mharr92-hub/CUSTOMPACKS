"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { markWhatsappSentAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";

/** "Abrir y marcar enviado" en un toque: abre WhatsApp con el texto precargado y lo registra. */
export function WhatsappSendButton({ notificationId, requestId, waLink }: { notificationId: string; requestId: string | null; waLink: string }) {
  const t = useTranslations("admin.whatsapp");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button asChild size="sm" disabled={busy}>
      <a
        href={waLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={async () => {
          setBusy(true);
          try {
            if (await markWhatsappSentAction(requestId ?? "", notificationId)) router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        <WhatsAppIcon className="size-4" />
        {t("openAndMark")}
      </a>
    </Button>
  );
}
