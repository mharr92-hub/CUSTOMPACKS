import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WhatsappSendButton } from "@/components/notify/whatsapp-queue";
import { EDITOR_ROLES, requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listPendingWhatsapp } from "@/lib/notify";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.whatsapp");
  return { title: t("title") };
}

/**
 * Cola de WhatsApp (M14, PAN-04): todos los avisos por WhatsApp que esperan
 * que alguien del equipo los envíe, de la solicitud o del pedido que sean.
 */
export default async function WhatsappQueuePage(props: PageProps<"/admin/whatsapp">) {
  const user = await requireStaff(undefined, "/admin/whatsapp");
  const t = await getTranslations("admin.whatsapp");
  const sp = await props.searchParams;
  const mine = sp.mios === "1";
  const rows = await listPendingWhatsapp(user, { mine });
  const canEdit = user.isActive && EDITOR_ROLES.includes(user.role);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      <nav className="mt-4 flex gap-3 text-sm" aria-label={t("filter")}>
        <Link href="/admin/whatsapp" aria-current={!mine ? "page" : undefined} className={mine ? "text-forest hover:underline" : "font-semibold"}>
          {t("all")}
        </Link>
        <Link href="/admin/whatsapp?mios=1" aria-current={mine ? "page" : undefined} className={mine ? "font-semibold" : "text-forest hover:underline"}>
          {t("mine")}
        </Link>
      </nav>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-card p-6 text-sm">{t("empty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card" data-testid="whatsapp-queue">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm" data-testid="whatsapp-pending">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.requestId ? (
                    <Link href={`/admin/solicitudes/${r.requestId}`} className="text-forest hover:underline">
                      {r.requestNumber}
                    </Link>
                  ) : null}
                  {r.requestNumber ? " · " : ""}
                  {r.templateName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.recipient} · {t("since", { date: formatDateTime(r.createdAt) })}
                </p>
              </div>
              {canEdit ? <WhatsappSendButton notificationId={r.id} requestId={r.requestId} waLink={r.waLink} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
