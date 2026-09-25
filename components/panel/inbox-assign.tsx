"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { assignAction } from "@/app/admin/(panel)/solicitudes/[id]/actions";
import { Button } from "@/components/ui/button";

/** "Tomar" o "Siguiente en turno" desde la bandeja, para solicitudes sin asignar. */
export function InboxAssign({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.inbox");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function assign(to: "me" | "next") {
    setBusy(true);
    try {
      const result = await assignAction(requestId, to);
      if (result.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void assign("me")}>
        {t("take")}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void assign("next")}>
        {t("next")}
      </Button>
    </span>
  );
}
