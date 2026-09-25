import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StaffArtwork, type StaffPiece } from "@/components/artwork/staff-artwork";
import { listRequestArtwork } from "@/lib/artwork/staff";
import { actorFor, EDITOR_ROLES, requireStaff } from "@/lib/auth";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { listRequestNotifications } from "@/lib/notify";
import { listTemplates } from "@/lib/notify/templates";
import { getRequestForUser } from "@/lib/quote/tracking";
import { RequestNotifications } from "@/components/notify/request-notifications";

export async function generateMetadata(props: PageProps<"/admin/solicitudes/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await getTranslations("admin.artwork");
  return { title: t("metaTitle", { id: id.slice(0, 8) }) };
}

/**
 * Solicitud en el panel. E4: arte y proofs por pieza, con la revisión de
 * preprensa. El detalle completo (notas, asignación, datos faltantes) se suma
 * con la bandeja.
 */
export default async function RequestArtworkPage(props: PageProps<"/admin/solicitudes/[id]">) {
  const { id } = await props.params;
  const user = await requireStaff(undefined, `/admin/solicitudes/${id}`);
  const request = await getRequestForUser(actorFor(user), id);
  if (!request) notFound();
  const [artwork, catalog, notifications, templates] = await Promise.all([
    listRequestArtwork(user, id),
    getPublicCatalog(),
    listRequestNotifications(user, id),
    listTemplates(user),
  ]);
  const templateName = (code: string, channel: string) => templates.find((tpl) => tpl.code === code && tpl.channel === channel)?.name ?? code;
  const t = await getTranslations("admin.artwork");
  const tr = await getTranslations("tracking");
  const tn = await getTranslations("admin.notifications");
  const pieces: StaffPiece[] = request.items.map((item) => ({
    id: item.id,
    label: `${tr("piece", { n: item.position })}${item.spec.type ? `: ${item.spec.type.name}` : ""}`,
    files: artwork.files
      .filter((f) => f.itemId === item.id)
      .map((f) => ({
        id: f.id,
        kind: f.kind,
        version: f.version,
        fileName: f.fileName,
        sizeBytes: f.sizeBytes,
        status: f.status,
        checklist: f.checklist,
        comments: f.comments,
        uploadedByClient: f.uploadedByClient,
        createdAt: f.createdAt.toISOString(),
        approval: f.approval ? { ...f.approval, approvedAt: f.approval.approvedAt.toISOString() } : null,
      })),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm text-muted-foreground">{[request.companyName, request.contactName].filter(Boolean).join(" · ")}</p>
      <h1 className="text-2xl font-semibold" data-testid="admin-request-number">
        {t("title", { number: request.number })}
      </h1>
      <p className="mt-1 text-sm">{tr(`statuses.${request.status}`)}</p>
      <div className="mt-6">
        <StaffArtwork requestId={request.id} pieces={pieces} canOpen={artwork.canOpen} canEdit={EDITOR_ROLES.includes(user.role)} limits={uploadSettings(catalog)} />
      </div>
      <section aria-labelledby="notifications-title" className="mt-10">
        <h2 id="notifications-title" className="text-lg font-semibold">
          {tn("title")}
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{tn("intro")}</p>
        <RequestNotifications
          requestId={request.id}
          canEdit={EDITOR_ROLES.includes(user.role)}
          rows={notifications.map((n) => ({
            id: n.id,
            templateCode: n.templateCode,
            templateName: templateName(n.templateCode, n.channel),
            audience: n.audience,
            channel: n.channel,
            recipient: n.recipient,
            status: n.status,
            subject: n.subject,
            body: n.body,
            waLink: n.waLink,
            error: n.error,
            createdAt: n.createdAt.toISOString(),
            manualSentAt: n.manualSentAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );
}
