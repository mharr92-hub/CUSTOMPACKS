import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { actorFor, requireStaff } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/states";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.reports");
  return { title: t("title") };
}

/** Reportes: pipeline de solicitudes por estado. */
export default async function ReportsPage() {
  const user = await requireStaff(undefined, "/admin/reportes");
  const t = await getTranslations("admin.reports");
  const ta = await getTranslations("admin");
  const rows = await withActor(actorFor(user), (tx) => tx<{ status: RequestStatus; n: number }[]>`
    select status, count(*)::int as n from public.quote_requests group by status`);
  const count = (s: RequestStatus) => rows.find((r) => r.status === s)?.n ?? 0;
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      <table className="mt-5 w-full rounded-lg border border-border bg-card text-sm" data-testid="pipeline">
        <thead className="bg-muted/60 text-left text-xs">
          <tr>
            <th scope="col" className="p-2">
              {t("status")}
            </th>
            <th scope="col" className="p-2 text-right">
              {t("count")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {REQUEST_STATUSES.filter((s) => s !== "draft").map((s) => (
            <tr key={s}>
              <td className="p-2">{ta(`statuses.${s}`)}</td>
              <td className="tabular p-2 text-right">{count(s)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="p-2">{t("total")}</td>
            <td className="tabular p-2 text-right">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
