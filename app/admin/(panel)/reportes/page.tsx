import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import type { CsvValue } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { getReports, resolveRange, type ColumnKind, type ReportTable } from "@/lib/panel/reports";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.reports");
  return { title: t("title") };
}

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value.length <= 20 ? value : null;
}

const int = new Intl.NumberFormat("es-PA");
const dec = new Intl.NumberFormat("es-PA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function show(value: CsvValue, kind: ColumnKind): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "int" && typeof value === "number") return int.format(value);
  if (kind === "dec" && typeof value === "number") return dec.format(value);
  if (kind === "pct" && typeof value === "number") return `${dec.format(value)} %`;
  if (kind === "date" && typeof value === "string") return formatDate(`${value}T17:00:00Z`);
  return String(value);
}

function Report({ table, csvHref, emptyText, csvText }: { table: ReportTable; csvHref: string; emptyText: string; csvText: string }) {
  const id = `report-${table.key}`;
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-card" data-testid={id}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id={id} className="font-semibold">
          {table.title}
        </h2>
        <a href={csvHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-forest hover:underline" download>
          <DownloadIcon aria-hidden="true" className="size-4" />
          {csvText}
        </a>
      </div>
      {table.note ? <p className="px-4 pt-3 text-xs text-muted-foreground">{table.note}</p> : null}
      <div className="overflow-x-auto p-4">
        {table.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {table.columns.map((c) => (
                  <th key={c.label} scope="col" className={cn("pb-2 font-medium", c.kind !== "text" && c.kind !== "date" && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((value, j) => {
                    const kind = table.columns[j]?.kind ?? "text";
                    return (
                      <td key={j} className={cn("py-1.5", kind !== "text" && kind !== "date" ? "tabular text-right" : "pr-3")}>
                        {show(value, kind)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/** Reportes (PRD §11) con exportación CSV por tabla. */
export default async function ReportsPage(props: PageProps<"/admin/reportes">) {
  const user = await requireStaff(undefined, "/admin/reportes");
  const sp = await props.searchParams;
  const range = resolveRange({ from: one(sp.desde), to: one(sp.hasta) });
  const t = await getTranslations("admin.reports");
  const tables = await getReports(user, range);
  const query = `desde=${range.from}&hasta=${range.to}`;
  const field = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p>
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="grid gap-1 text-xs font-medium">
          {t("from")}
          <input type="date" name="desde" defaultValue={range.from} max={range.to} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          {t("to")}
          <input type="date" name="hasta" defaultValue={range.to} className={field} />
        </label>
        <button type="submit" className="h-9 rounded-md bg-forest px-4 text-sm font-medium text-white hover:bg-forest/90">
          {t("apply")}
        </button>
        <p className="text-sm text-muted-foreground" data-testid="report-period">
          {t("period", { from: formatDate(`${range.from}T17:00:00Z`), to: formatDate(`${range.to}T17:00:00Z`) })}
        </p>
      </form>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {tables.map((table) => (
          <Report
            key={table.key}
            table={table}
            csvHref={`/api/reportes/${table.key}?${query}`}
            emptyText={t("empty")}
            csvText={t("csv")}
          />
        ))}
      </div>
    </div>
  );
}
