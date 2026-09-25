import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StaffArtwork, type StaffPiece } from "@/components/artwork/staff-artwork";
import { RequestNotifications } from "@/components/notify/request-notifications";
import { AssignControl, MissingDataControl, NoteForm, StatusControl } from "@/components/panel/request-actions";
import { QuotePanel, RfqPanel } from "@/components/panel/rfq-quote";
import { listRequestArtwork } from "@/lib/artwork/staff";
import { EDITOR_ROLES, requireStaff } from "@/lib/auth";
import { getPublicCatalog, taxLabel, uploadSettings } from "@/lib/catalog/public";
import { getServerEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { listRequestNotifications } from "@/lib/notify";
import { getOrderRefForRequest } from "@/lib/orders";
import { listTemplates } from "@/lib/notify/templates";
import { getRequestDetail, getTimeline, listAssignableStaff, type TimelineEntry } from "@/lib/panel/requests";
import { specRows, type SpecTranslator } from "@/lib/quote/spec";
import { listQuotes } from "@/lib/quotes";
import { listRfqs } from "@/lib/rfq";
import { nextStatuses } from "@/lib/states";
import { signedUrl } from "@/lib/storage";
import { absoluteUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/admin/solicitudes/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const t = await getTranslations("admin.artwork");
  return { title: t("metaTitle", { id: id.slice(0, 8) }) };
}

const LIGHT_DOT = { green: "bg-signal-green", yellow: "bg-signal-yellow", red: "bg-signal-red" } as const;

function Section({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-lg border border-border bg-card", className)}>
      <h2 id={id} className="border-b border-border px-4 py-3 font-semibold">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Detalle de la solicitud (PRD §11). */
export default async function RequestPage(props: PageProps<"/admin/solicitudes/[id]">) {
  const { id } = await props.params;
  const user = await requireStaff(undefined, `/admin/solicitudes/${id}`);
  const request = await getRequestDetail(user, id);
  if (!request) notFound();
  const [timeline, artwork, catalog, notifications, templates, staff, rfqs, quotes, order] = await Promise.all([
    getTimeline(user, id),
    listRequestArtwork(user, id),
    getPublicCatalog(),
    listRequestNotifications(user, id),
    listTemplates(user),
    listAssignableStaff(user),
    listRfqs(user, id),
    listQuotes(user, id),
    getOrderRefForRequest(user, id),
  ]);
  const t = await getTranslations("admin.request");
  const ta = await getTranslations("admin");
  const tr = await getTranslations("tracking");
  const tn = await getTranslations("admin.notifications");
  const tf = await getTranslations("notify");
  const ts = await getTranslations("spec");
  const tw = await getTranslations("wizard");
  const tart = await getTranslations("artwork");
  const specT: SpecTranslator = (key, values) => ts(key as "none", values as never);
  const canEdit = EDITOR_ROLES.includes(user.role);
  const templateName = (code: string, channel: string) => templates.find((tpl) => tpl.code === code && tpl.channel === channel)?.name ?? code;
  const staffName = (userId: string | null | undefined) => staff.find((s) => s.userId === userId)?.name ?? null;

  // Lista de datos faltantes a partir del semáforo (se puede ajustar antes de enviar).
  const missingList = [
    ...new Set(
      request.missingFields.map(({ item, field }) => {
        const label = tf.has(`field.${field}` as never) ? tf(`field.${field}` as "field.type") : field;
        return request.items.length > 1 ? tf("pieceField", { field: label, n: item }) : label;
      }),
    ),
  ].join(", ");
  const missingTemplate = templates.find((tpl) => tpl.code === "data_missing" && tpl.channel === "whatsapp")?.body ?? "";
  const previewVars = { nombre: request.contactName.split(/\s+/)[0] ?? request.contactName, numero: request.number, enlace: absoluteUrl("/seguimiento/…") };

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
  // Fotos de referencia: solo el equipo asignado y admin las abren (D-048).
  const photoUrls = new Map<string, string>();
  if (artwork.canOpen) {
    for (const ref of request.references) {
      if (ref.kind === "photo" && ref.storagePath) photoUrls.set(ref.storagePath, await signedUrl("artwork", ref.storagePath, { expiresIn: 600 }));
    }
  }

  const panelItems = request.items.map((i) => ({ id: i.id, position: i.position, label: i.spec.type?.name ?? ts("typeAdvice"), quantities: i.spec.quantities }));

  const describe = (e: TimelineEntry): string => {
    if (e.type === "status") return e.from === null ? t("timeline.created") : t("timeline.status", { status: ta(`statuses.${e.to}`) });
    if (e.kind === "contact") return t("timeline.contact", { channel: t(`channels.${e.channel as "whatsapp"}`) });
    if (e.kind === "notification") return `${t("timeline.notification")}: ${templateName(e.body ?? "", e.channel)}`;
    return t.has(`timeline.${e.kind}` as never) ? t(`timeline.${e.kind}` as "timeline.note") : t("timeline.other");
  };
  const detailOf = (e: TimelineEntry): string | null => {
    if (e.type === "status") return e.reason;
    if (e.kind === "assigned") return staffName(e.body) ?? t("nobody");
    if (e.kind === "notification" || e.kind === "notification_manual_sent") return null;
    if (e.kind === "artwork_reviewed") return e.body ? tart(`statuses.${e.body as "received"}`) : null;
    return e.body;
  };

  const clientRows: [string, string | null][] = [
    [t("company"), request.companyName],
    [t("ruc"), request.ruc],
    [t("contact"), request.contactName],
    [t("position"), request.contactPosition],
    [t("email"), request.contactEmail],
    [t("whatsapp"), request.contactWhatsapp],
    [t("delivery"), [request.deliveryAddress, request.deliveryCity].filter(Boolean).join(", ") || null],
    [t("desiredDate"), request.desiredDate],
    [t("comments"), request.comments],
    [t("source"), request.leadSource ? tw(`sourceOptions.${request.leadSource as "other"}`) : null],
    [t("utm"), Object.entries(request.utm).map(([k, v]) => `${k}=${v}`).join(" · ") || null],
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/admin/solicitudes" className="text-sm text-muted-foreground hover:underline">
        {t("back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="admin-request-number">
          {ta("artwork.title", { number: request.number })}
        </h1>
        <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-medium" data-testid="admin-request-status">
          {ta(`statuses.${request.status}`)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", LIGHT_DOT[request.trafficLight])} />
          {ta(`lights.${request.trafficLight}`)}
        </span>
        {request.needsAdvice ? <span className="rounded-md bg-kraft-light px-2 py-0.5 text-xs font-medium text-kraft-dark">{t("needsAdvice")}</span> : null}
        {order ? (
          <Link href={`/admin/pedidos/${order.id}`} className="rounded-md bg-forest px-2 py-0.5 text-sm font-medium text-white hover:underline" data-testid="request-order-link">
            {t("orderLink", { number: order.number })}
          </Link>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {[request.companyName, request.contactName].filter(Boolean).join(" · ")}
        {" · "}
        {formatDateTime(request.submittedAt)}
        {request.sla.kind ? (
          <span className={cn(request.sla.overdue && "font-semibold text-signal-red")}>
            {" · "}
            {ta(request.sla.kind === "first" ? "inbox.slaFirst" : "inbox.slaQuote", {
              hours: new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(request.sla.hours),
              limit: request.sla.limit,
            })}
            {request.sla.overdue ? ` · ${t("slaOverdue")}` : ""}
          </span>
        ) : null}
      </p>
      {canEdit ? null : <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{t("readOnly")}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Section id="client-title" title={t("clientTitle")}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              {clientRows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value || t("none")}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="pieces-title" title={t("piecesTitle")}>
            <div className="space-y-5">
              {request.items.map((item) => {
                const refs = request.references.filter((r) => r.itemId === item.id);
                return (
                  <article key={item.id}>
                    <h3 className="font-semibold">
                      {tr("piece", { n: item.position })}
                      {item.spec.type ? `: ${item.spec.type.code} · ${item.spec.type.name}` : ""}
                    </h3>
                    <dl className="mt-2 divide-y divide-border text-sm">
                      {specRows(item.spec, specT).map((r) => (
                        <div key={r.label} className="grid grid-cols-[11rem_1fr] gap-3 py-1.5">
                          <dt className="text-muted-foreground">{r.label}</dt>
                          <dd className="break-words">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {refs.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-sm font-medium">{t("referencesTitle")}</p>
                        <ul className="mt-1 flex flex-wrap gap-3 text-sm">
                          {refs.map((ref, i) => (
                            <li key={`${ref.kind}-${i}`}>
                              {ref.kind === "photo" && ref.storagePath && photoUrls.get(ref.storagePath) ? (
                                <a href={photoUrls.get(ref.storagePath)} target="_blank" rel="noopener noreferrer" className="block">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado con URL firmada de corta duración */}
                                  <img src={photoUrls.get(ref.storagePath)} alt={ref.note ?? t("photo")} className="h-20 w-28 rounded-md border border-border object-cover" />
                                </a>
                              ) : ref.kind === "photo" ? (
                                <span className="text-muted-foreground">{`${t("photo")}: ${ref.note ?? ""}`}</span>
                              ) : ref.kind === "link" && ref.url ? (
                                <a href={ref.url} target="_blank" rel="noopener noreferrer nofollow" className="text-forest underline underline-offset-4">
                                  {ref.url}
                                </a>
                              ) : (
                                <span>{`${t("sample")}: ${ref.sampleCode ?? ""} · ${ref.sampleName ?? ""}`}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </Section>

          <div>
            <h2 className="mb-3 text-lg font-semibold">{ta("artwork.titleShort")}</h2>
            <StaffArtwork requestId={request.id} pieces={pieces} canOpen={artwork.canOpen} canEdit={canEdit} limits={uploadSettings(catalog)} />
          </div>

          <Section id="rfq-title" title={ta("rfq.title")}>
            <RfqPanel
              requestId={request.id}
              items={panelItems}
              canEdit={canEdit}
              canGenerate={request.status === "in_review" || request.status === "rfq_sent"}
              factoryEmail={Boolean(getServerEnv().factoryEmail)}
              rfqs={rfqs.map((r) => ({
                id: r.id,
                number: r.number,
                createdAt: r.createdAt.toISOString(),
                sentAt: r.sentAt?.toISOString() ?? null,
                sentTo: r.sentTo,
                respondedAt: r.respondedAt?.toISOString() ?? null,
                costs: r.costs,
                currency: r.currency,
                productionDays: r.productionDays,
                notes: r.notes,
              }))}
            />
          </Section>

          <Section id="quote-title" title={ta("quote.title")}>
            <QuotePanel
              requestId={request.id}
              items={panelItems}
              canEdit={canEdit}
              canPrepare={["rfq_sent", "quoted", "expired"].includes(request.status) && (rfqs.some((r) => r.respondedAt) || quotes.length > 0)}
              taxLabel={taxLabel(catalog)}
              quotes={quotes.map((q) => ({
                id: q.id,
                number: q.number,
                status: q.status,
                lines: q.lines,
                currency: q.currency,
                validUntil: q.validUntil,
                notes: q.notes,
                sentAt: q.sentAt?.toISOString() ?? null,
                acceptedAt: q.acceptedAt?.toISOString() ?? null,
                acceptedByName: q.acceptedByName,
                acceptedSelection: q.acceptedSelection,
                hasPdf: q.hasPdf,
              }))}
            />
          </Section>

          <Section id="timeline-title" title={t("timelineTitle")}>
            {canEdit ? (
              <div className="mb-5 rounded-md border border-border p-3">
                <p className="mb-2 text-sm font-medium">{t("notesTitle")}</p>
                <NoteForm requestId={request.id} />
              </div>
            ) : null}
            <ol className="space-y-3" data-testid="timeline">
              {timeline.map((e, i) => {
                const detail = detailOf(e);
                return (
                  <li key={i} className="grid grid-cols-[9.5rem_1fr] gap-3 text-sm">
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                    <div>
                      <p className="font-medium">
                        {describe(e)}
                        <span className="font-normal text-muted-foreground">{` · ${t("by", { name: e.by ?? t("system") })}`}</span>
                      </p>
                      {detail ? <p className={cn("mt-0.5 whitespace-pre-line", e.type === "activity" && e.kind === "client_reply" && "rounded-md bg-kraft-light px-2 py-1")}>{detail}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Section id="notifications-title" title={tn("title")}>
            <p className="mb-3 text-sm text-muted-foreground">{tn("intro")}</p>
            <RequestNotifications
              requestId={request.id}
              canEdit={canEdit}
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
          </Section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <Section id="assign-title" title={t("assignedTo")}>
            <p className="mb-3 text-sm font-medium" data-testid="assigned-name">
              {request.assignedName ?? t("nobody")}
            </p>
            {canEdit ? <AssignControl requestId={request.id} assignedTo={request.assignedTo} staff={staff} /> : null}
          </Section>
          <Section id="status-title" title={t("statusTitle")}>
            {canEdit ? <StatusControl requestId={request.id} next={nextStatuses(request.status)} /> : <p className="text-sm">{ta(`statuses.${request.status}`)}</p>}
            {request.lossReason ? <p className="mt-2 text-sm">{`${t("lossReason")}: ${ta(`lossReasons.${request.lossReason}`)}${request.lossNote ? ` · ${request.lossNote}` : ""}`}</p> : null}
          </Section>
          {canEdit ? (
            <Section id="missing-title" title={t("missingTitle")}>
              <MissingDataControl
                requestId={request.id}
                available={request.status === "submitted" || request.status === "in_review"}
                defaultList={missingList}
                template={missingTemplate}
                vars={previewVars}
              />
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
