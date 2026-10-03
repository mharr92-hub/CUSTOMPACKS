"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trackingLinkSentAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";

/** Enlace de seguimiento del cliente: copiarlo o reenviarlo por WhatsApp (M14, PAN-15). */
export function TrackingLinkTools({ requestId, link, whatsappHref, canEdit }: { requestId: string; link: string; whatsappHref: string | null; canEdit: boolean }) {
  const t = useTranslations("admin.request");
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="tracking-link">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success(t("trackingCopied"));
          } catch {
            window.prompt(t("trackingCopy"), link);
          }
        }}
      >
        {copied ? t("trackingCopied") : t("trackingCopy")}
      </Button>
      {canEdit && whatsappHref ? (
        <Button asChild size="sm" variant="outline">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={async () => {
              const result = await trackingLinkSentAction(requestId);
              if (result.ok) router.refresh();
            }}
          >
            <WhatsAppIcon className="size-4" />
            {t("trackingResend")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
