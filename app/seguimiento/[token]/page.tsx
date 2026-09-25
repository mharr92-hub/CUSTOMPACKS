import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileTextIcon } from "lucide-react";
import { PortalArtwork, type PortalPiece } from "@/components/artwork/portal-artwork";
import { ClientOrder } from "@/components/portal/client-order";
import { ClientQuote } from "@/components/portal/client-quote";
import { PendingReply } from "@/components/portal/pending-reply";
import { WhatsAppIcon } from "@/components/site/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { listPortalArtwork } from "@/lib/artwork/client-portal";
import { formatDateTime } from "@/lib/format";
import { getClientOrder } from "@/lib/orders";
import { getClientQuote } from "@/lib/quotes";
import { getPublicCatalog, uploadSettings } from "@/lib/catalog/public";
import { specPdfPath } from "@/lib/quote/links";
import { specRows, type SpecTranslator } from "@/lib/quote/spec";
import { getRequestByToken } from "@/lib/quote/tracking";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tracking");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * Seguimiento del cliente por enlace seguro (PRD §10). E3: estado, piezas e
 * historial; arte (E4), cotización (E7) y pedido (E8).
 */
export default async function TrackingPage(props: PageProps<"/seguimiento/[token]">) {
  const { token } = await props.params;
  const request = await getRequestByToken(token);
  if (!request) notFound();
  const t = await getTranslations("tracking");
  const ts = await getTranslations("spec");
  const specT: SpecTranslator = (key, values) => ts(key as "none", values as never);
  const [files, catalog, quote, order] = await Promise.all([listPortalArtwork(token), getPublicCatalog(), getClientQuote(token), getClientOrder(token)]);
  // Arte: piezas con impresión o con archivos ya cargados.
  const artPieces: PortalPiece[] = request.items
    .filter((item) => item.spec.artwork !== "not_applicable" || files.some((f) => f.itemId === item.id))
    .map((item) => ({
      id: item.id,
      label: `${t("piece", { n: item.position })}${item.spec.type ? `: ${item.spec.type.name}` : ""}`,
      printing: item.spec.artwork !== "not_applicable",
      files: files
        .filter((f) => f.itemId === item.id)
        .map((f) => ({
          id: f.id,
          kind: f.kind,
          version: f.version,
          fileName: f.fileName,
          status: f.status,
          checklist: f.checklist,
          comments: f.comments,
          createdAt: f.createdAt.toISOString(),
          approval: f.approval ? { approvedAt: f.approval.approvedAt.toISOString(), name: f.approval.name } : null,
        })),
    }));
  const ta = await getTranslations("artwork");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">{t("title", { number: request.number })}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("submittedAt", { date: formatDateTime(request.submittedAt) })}</p>

      <section aria-labelledby="status-title" className="mt-6 rounded-lg border-2 border-forest p-5">
        <h2 id="status-title" className="text-sm font-semibold text-muted-foreground">
          {t("status")}
        </h2>
        <p className="mt-1 text-2xl font-bold" data-testid="request-status">
          {t(`statuses.${request.status}`)}
        </p>
        {t(`statusHelp.${request.status}`) ? <p className="mt-1 text-muted-foreground">{t(`statusHelp.${request.status}`)}</p> : null}
      </section>

      {request.status === "data_pending" ? <PendingReply token={token} list={request.pendingList} /> : null}
      {order ? <ClientOrder order={order} token={token} specHref={specPdfPath(request.id, token)} maxMb={uploadSettings(catalog).maxMb} /> : null}
      {quote ? (
        <ClientQuote
          token={token}
          contactName={request.contactName}
          quote={{
            id: quote.id,
            number: quote.number,
            status: quote.status,
            validUntil: quote.validUntil,
            acceptedAt: quote.acceptedAt?.toISOString() ?? null,
            acceptedByName: quote.acceptedByName,
            acceptedSelection: quote.acceptedSelection,
            options: quote.options,
          }}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <a href={specPdfPath(request.id, token)} target="_blank" rel="noopener">
            <FileTextIcon className="size-4" />
            {t("pdf")}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={whatsappLink(t("helpText", { brand: brand.name, number: request.number }))} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="size-4" />
            {t("help")}
          </a>
        </Button>
      </div>

      <section aria-labelledby="pieces-title" className="mt-10">
        <h2 id="pieces-title" className="text-xl font-bold">
          {t("pieces")}
        </h2>
        <div className="mt-4 space-y-4">
          {request.items.map((item) => (
            <article key={item.id} className="rounded-lg border border-border">
              <h3 className="border-b border-border bg-muted/50 px-4 py-3 font-bold">
                {t("piece", { n: item.position })}
                {item.spec.type ? `: ${item.spec.type.name}` : ""}
              </h3>
              <dl className="divide-y divide-border px-4 py-2 text-sm">
                {specRows(item.spec, specT).map((r) => (
                  <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-3 py-2 sm:grid-cols-[12rem_1fr]">
                    <dt className="text-muted-foreground">{r.label}</dt>
                    <dd className="font-medium break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      {artPieces.length > 0 ? (
        <section aria-labelledby="artwork-title" className="mt-10">
          <h2 id="artwork-title" className="text-xl font-bold">
            {ta("sectionTitle")}
          </h2>
          <p className="mt-1 text-muted-foreground">{ta("sectionIntro")}</p>
          <div className="mt-4">
            <PortalArtwork token={token} pieces={artPieces} contactName={request.contactName} limits={uploadSettings(catalog)} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="history-title" className="mt-10">
        <h2 id="history-title" className="text-xl font-bold">
          {t("timeline")}
        </h2>
        <ol className="mt-4 border-l-2 border-dashed border-forest/40 pl-5">
          {request.history.map((h, i) => (
            <li key={`${h.status}-${i}`} className="relative pb-5 last:pb-0">
              <span aria-hidden="true" className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-forest" />
              <p className="font-semibold">{t(`statuses.${h.status}`)}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(h.at)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
