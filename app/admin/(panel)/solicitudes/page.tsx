import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InboxAssign } from "@/components/panel/inbox-assign";
import { EDITOR_ROLES, requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { listAssignableStaff, listInbox, type InboxFilters } from "@/lib/panel/requests";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/states";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.inbox");
  return { title: t("title") };
}

const LIGHT_DOT = { green: "bg-signal-green", yellow: "bg-signal-yellow", red: "bg-signal-red" } as const;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length <= 100 ? value : undefined;
}

/** Bandeja (PRD §11): filtros, SLA en horas hábiles y orden por urgencia. */
export default async function InboxPage(props: PageProps<"/admin/solicitudes">) {
  const user = await requireStaff(undefined, "/admin/solicitudes");
  const sp = await props.searchParams;
  const t = await getTranslations("admin.inbox");
  const ta = await getTranslations("admin");
  const statusParam = one(sp.estado);
  const filters: InboxFilters = {
    status: statusParam === "todas" ? [...REQUEST_STATUSES] : statusParam && (REQUEST_STATUSES as readonly string[]).includes(statusParam) ? [statusParam as RequestStatus] : undefined,
    segment: (["commercial", "food", "unsure"] as const).find((s) => s === one(sp.segmento)),
    light: (["green", "yellow", "red"] as const).find((s) => s === one(sp.semaforo)),
    from: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.desde) ?? "") ? one(sp.desde) : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.hasta) ?? "") ? one(sp.hasta) : undefined,
    minQty: Number(one(sp.min)) > 0 ? Number(one(sp.min)) : undefined,
    maxQty: Number(one(sp.max)) > 0 ? Number(one(sp.max)) : undefined,
    assigned: one(sp.asignada),
    q: one(sp.q),
  };
  const [rows, staff] = await Promise.all([listInbox(user, filters), listAssignableStaff(user)]);
  const canEdit = EDITOR_ROLES.includes(user.role);
  const fmtQty = (n: number | null) => (n === null ? "—" : new Intl.NumberFormat("es-PA").format(n));
  const fmtHours = (h: number) => new Intl.NumberFormat("es-PA", { maximumFractionDigits: 1 }).format(h);
  const field = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>

      <form method="get" className="mt-5 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label={t("filters")}>
        <label className="grid gap-1 text-xs font-medium">
          {t("status")}
          <select name="estado" defaultValue={statusParam ?? ""} className={field}>
            <option value="">{t("allOpen")}</option>
            <option value="todas">{t("all")}</option>
            {REQUEST_STATUSES.filter((s) => s !== "draft").map((s) => (
              <option key={s} value={s}>
                {ta(`statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("segment")}
          <select name="segmento" defaultValue={filters.segment ?? ""} className={field}>
            <option value="">{t("all")}</option>
            {(["commercial", "food", "unsure"] as const).map((s) => (
              <option key={s} value={s}>
                {ta(`segments.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("light")}
          <select name="semaforo" defaultValue={filters.light ?? ""} className={field}>
            <option value="">{t("all")}</option>
            {(["red", "yellow", "green"] as const).map((l) => (
              <option key={l} value={l}>
                {ta(`lights.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("assigned")}
          <select name="asignada" defaultValue={filters.assigned ?? ""} className={field}>
            <option value="">{t("anyone")}</option>
            <option value="me">{t("me")}</option>
            <option value="none">{t("unassigned")}</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("search")}
          <input name="q" defaultValue={filters.q ?? ""} placeholder={t("searchPlaceholder")} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("from")}
          <input type="date" name="desde" defaultValue={filters.from ?? ""} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("to")}
          <input type="date" name="hasta" defaultValue={filters.to ?? ""} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("minQty")}
          <input type="number" min={1} name="min" defaultValue={filters.minQty ?? ""} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("maxQty")}
          <input type="number" min={1} name="max" defaultValue={filters.maxQty ?? ""} className={field} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="h-9 rounded-md bg-forest px-4 text-sm font-medium text-paper hover:bg-forest-dark">
            {t("apply")}
          </button>
          <Link href="/admin/solicitudes" className="h-9 content-center px-2 text-sm text-muted-foreground hover:underline">
            {t("clear")}
          </Link>
        </div>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">{t("count", { n: rows.length })}</p>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-lg border border-border bg-card p-6 text-sm">{t("none")}</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[980px] text-sm" data-testid="inbox">
            <thead className="bg-muted/60 text-left text-xs">
              <tr>
                <th scope="col" className="p-2">{t("columns.number")}</th>
                <th scope="col" className="p-2">{t("columns.client")}</th>
                <th scope="col" className="p-2">{t("columns.pieces")}</th>
                <th scope="col" className="p-2 text-right">{t("columns.qty")}</th>
                <th scope="col" className="p-2">{t("columns.status")}</th>
                <th scope="col" className="p-2">{t("columns.light")}</th>
                <th scope="col" className="p-2">{t("columns.sla")}</th>
                <th scope="col" className="p-2">{t("columns.assigned")}</th>
                <th scope="col" className="p-2">{t("columns.submitted")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.sla.overdue && "bg-signal-red/5")} data-testid="inbox-row">
                  <td className="p-2 font-medium whitespace-nowrap">
                    <Link href={`/admin/solicitudes/${r.id}`} className="text-forest hover:underline">
                      {r.number}
                    </Link>
                    {r.isDemo ? <span className="ml-1.5 rounded border border-dashed border-ink/40 px-1 text-[10px] font-semibold tracking-wide">{ta("demo")}</span> : null}
                  </td>
                  <td className="max-w-48 truncate p-2" title={r.contactName}>
                    {r.company}
                  </td>
                  <td className="max-w-56 truncate p-2">{r.pieces.map((name) => name ?? t("advice")).join(", ")}</td>
                  <td className="tabular p-2 text-right">{fmtQty(r.maxQuantity)}</td>
                  <td className="p-2 whitespace-nowrap">{ta(`statuses.${r.status}`)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={cn("size-2.5 rounded-full", LIGHT_DOT[r.trafficLight])} />
                      {ta(`lights.${r.trafficLight}`)}
                    </span>
                  </td>
                  <td className={cn("p-2 whitespace-nowrap", r.sla.overdue && "font-semibold text-signal-red")}>
                    {r.sla.kind === null
                      ? t("slaNone")
                      : t(r.sla.kind === "first" ? "slaFirst" : "slaQuote", { hours: fmtHours(r.sla.hours), limit: r.sla.limit })}
                    {r.sla.overdue ? ` · ${t("overdue")}` : ""}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {r.assignedName ?? (canEdit ? <InboxAssign requestId={r.id} /> : "—")}
                  </td>
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{formatDateTime(r.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
