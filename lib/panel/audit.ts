import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";

/** Auditoría (PRD §11): quién cambió qué y cuándo, con valores antes/después. Solo admin. */
export type AuditEntry = {
  id: number;
  table: string;
  recordId: string | null;
  action: "insert" | "update" | "delete";
  actor: string | null;
  at: Date;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed: string[];
};

export async function listAudit(user: CurrentUser, filters: { table?: string; recordId?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const table = filters.table && /^[a-z_]{2,40}$/.test(filters.table) ? filters.table : null;
  const recordId = filters.recordId && /^[0-9a-f-]{36}$/i.test(filters.recordId) ? filters.recordId : null;
  const rows = await withActor(actorFor(user), (tx) => tx<
    {
      id: string;
      table_name: string;
      record_id: string | null;
      action: AuditEntry["action"];
      actor: string | null;
      at: Date;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      changed: string[] | null;
    }[]
  >`
    select a.id, a.table_name, a.record_id, a.action, coalesce(p.name, p.email) as actor, a.at, a.before, a.after, a.changed
      from public.audit_log a left join public.profiles p on p.user_id = a.actor
     where true
       ${table ? tx`and a.table_name = ${table}` : tx``}
       ${recordId ? tx`and a.record_id = ${recordId}` : tx``}
     order by a.at desc, a.id desc
     limit ${Math.min(Math.max(filters.limit ?? 100, 1), 500)}`);
  return rows.map((r) => ({
    id: Number(r.id),
    table: r.table_name,
    recordId: r.record_id,
    action: r.action,
    actor: r.actor,
    at: r.at,
    before: r.before,
    after: r.after,
    changed: r.changed ?? [],
  }));
}

/** Tablas auditadas (para el filtro del panel). */
export const AUDITED_TABLES = [
  "quote_requests",
  "quote_items",
  "companies",
  "artwork_files",
  "profiles",
  "settings",
  "message_templates",
  "categories",
  "product_types",
  "standard_sizes",
  "papers",
  "calibers",
  "print_options",
  "finishes",
  "eco_attributes",
  "food_attributes",
  "compatibilities",
  "gallery_samples",
] as const;
