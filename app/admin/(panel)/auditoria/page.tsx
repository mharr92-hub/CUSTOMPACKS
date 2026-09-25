import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { AUDITED_TABLES, listAudit } from "@/lib/panel/audit";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** Auditoría (solo admin): quién, qué, cuándo, antes y después. */
export default async function AuditPage(props: PageProps<"/admin/auditoria">) {
  const user = await requireStaff(["admin"], "/admin/auditoria");
  const sp = await props.searchParams;
  const table = typeof sp.tabla === "string" ? sp.tabla : undefined;
  const t = await getTranslations("admin.audit");
  const entries = await listAudit(user, { table, recordId: typeof sp.id === "string" ? sp.id : undefined, limit: 200 });
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <form method="get" className="mt-4 flex items-end gap-2">
        <label className="grid gap-1 text-xs font-medium">
          {t("table")}
          <select name="tabla" defaultValue={table ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">{t("allTables")}</option>
            {AUDITED_TABLES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md border border-border px-3 text-sm">
          {t("filter")}
        </button>
      </form>
      {entries.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">{t("none")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm" data-testid="audit">
            <thead className="bg-muted/60 text-left text-xs">
              <tr>
                <th scope="col" className="p-2">
                  {t("columns.at")}
                </th>
                <th scope="col" className="p-2">
                  {t("columns.who")}
                </th>
                <th scope="col" className="p-2">
                  {t("columns.what")}
                </th>
                <th scope="col" className="p-2">
                  {t("columns.change")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border align-top">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{formatDateTime(e.at)}</td>
                  <td className="p-2">{e.actor ?? t("system")}</td>
                  <td className="p-2">
                    <p className="font-medium">{`${t(`actions.${e.action}`)} · ${e.table}`}</p>
                    <p className="font-mono text-xs text-muted-foreground">{e.recordId}</p>
                  </td>
                  <td className="p-2">
                    {e.action === "update" ? (
                      <ul className="space-y-0.5 font-mono text-xs">
                        {e.changed.map((k) => (
                          <li key={k}>{`${k}: ${show(e.before?.[k])} → ${show(e.after?.[k])}`}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="font-mono text-xs text-muted-foreground">{show(e.after ?? e.before)}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
