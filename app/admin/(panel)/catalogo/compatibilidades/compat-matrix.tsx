"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompatRuleRow, RefOption } from "@/lib/catalog/admin";
import { evaluateCaliber, evaluatePaper, type CompatRule } from "@/lib/compat";
import { cn } from "@/lib/utils";
import { setCompatRuleAction, type FormState } from "../actions";

type Cell = { paperId: string | null; caliberId: string | null };
type State = "none" | "allowed" | "blocked";

function nameOf(list: RefOption[], id: string | null, fallback: string): string {
  return id ? (list.find((o) => o.id === id)?.name ?? id) : fallback;
}

function ruleFor(rules: CompatRuleRow[], cell: Cell): CompatRuleRow | undefined {
  return rules.find((r) => r.paper_id === cell.paperId && r.caliber_id === cell.caliberId);
}

function CellButton({
  cell,
  disabledReason,
  rules,
  papers,
  calibers,
  canEdit,
  onEdit,
}: {
  cell: Cell;
  disabledReason?: boolean;
  rules: CompatRuleRow[];
  papers: RefOption[];
  calibers: RefOption[];
  canEdit: boolean;
  onEdit: (cell: Cell) => void;
}) {
  const t = useTranslations("admin.compat");
  const rule = ruleFor(rules, cell);
  const s: State = rule ? (rule.allowed ? "allowed" : "blocked") : "none";
  const label = `${nameOf(papers, cell.paperId, t("anyPaper"))} · ${nameOf(calibers, cell.caliberId, t("anyCaliber"))}: ${t(`states.${s}`)}`;
  const symbol = s === "allowed" ? "✓" : s === "blocked" ? "✕" : "·";
  return (
    <button
      type="button"
      disabled={!canEdit || disabledReason}
      onClick={() => onEdit(cell)}
      title={rule?.reason ?? label}
      aria-label={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border text-base font-semibold transition-colors disabled:cursor-default",
        s === "allowed" && "border-signal-green/40 bg-signal-green/10 text-signal-green",
        s === "blocked" && "border-signal-red/40 bg-signal-red/10 text-signal-red",
        s === "none" && "border-border text-muted-foreground",
        canEdit && !disabledReason && "hover:border-primary",
        disabledReason && "opacity-30",
      )}
    >
      {symbol}
    </button>
  );
}

export function CompatMatrix({
  typeId,
  typeName,
  papers,
  calibers,
  rules,
  canEdit,
}: {
  typeId: string;
  typeName: string;
  papers: RefOption[];
  calibers: RefOption[];
  rules: CompatRuleRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("admin.compat");
  const [editing, setEditing] = useState<Cell | null>(null);
  const [, action, pending] = useActionState<FormState, FormData>(async (prev, data) => {
    const result = await setCompatRuleAction(prev, data);
    if (result.status === "saved") {
      toast.success(t("saved"));
      setEditing(null);
    }
    return result;
  }, { status: "idle" });

  const compatRules: CompatRule[] = rules.map((r) => ({
    productTypeId: r.product_type_id,
    paperId: r.paper_id,
    caliberId: r.caliber_id,
    allowed: r.allowed,
    reason: r.reason,
  }));

  const shared = { rules, papers, calibers, canEdit, onEdit: setEditing };
  const editingRule = editing ? ruleFor(rules, editing) : undefined;
  const editingState: State = editingRule ? (editingRule.allowed ? "allowed" : "blocked") : "none";

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">{typeName}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("paper")}
              </th>
              <th scope="col" className="px-3 py-2 text-center font-medium">
                {t("anyCaliber")}
              </th>
              {calibers.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 text-center font-medium">
                  {c.name}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("result")}
              </th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p) => {
              const decision = evaluatePaper(compatRules, typeId, p.id);
              return (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-mono text-xs text-muted-foreground">{p.code}</span> {p.name}
                  </th>
                  <td className="px-3 py-2 text-center">
                    <CellButton cell={{ paperId: p.id, caliberId: null }} {...shared} />
                  </td>
                  {calibers.map((c) => {
                    const cd = evaluateCaliber(compatRules, typeId, p.id, c.id);
                    return (
                      <td key={c.id} className={cn("px-3 py-2 text-center", decision.allowed && !cd.allowed && "bg-signal-red/5")}>
                        <CellButton cell={{ paperId: p.id, caliberId: c.id }} {...shared} />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <span className={cn("text-xs font-medium", decision.allowed ? "text-signal-green" : "text-signal-red")}>
                      {decision.allowed ? t("allowedResult") : decision.kind === "requires" ? t("requiresResult") : t("blockedResult")}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/40">
              <th scope="row" className="px-3 py-2 text-left font-normal italic">
                {t("anyPaper")}
              </th>
              <td className="px-3 py-2 text-center">
                <CellButton cell={{ paperId: null, caliberId: null }} disabledReason {...shared} />
              </td>
              {calibers.map((c) => (
                <td key={c.id} className="px-3 py-2 text-center">
                  <CellButton cell={{ paperId: null, caliberId: c.id }} {...shared} />
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <DialogContent>
          {editing ? (
            <form action={action} key={`${editing.paperId}-${editing.caliberId}-${editingState}`} className="space-y-4">
              <DialogHeader>
                <DialogTitle>
                  {t("editCell", { paper: nameOf(papers, editing.paperId, t("anyPaper")), caliber: nameOf(calibers, editing.caliberId, t("anyCaliber")) })}
                </DialogTitle>
                <DialogDescription>{typeName}</DialogDescription>
              </DialogHeader>
              <input type="hidden" name="productTypeId" value={typeId} />
              <input type="hidden" name="paperId" value={editing.paperId ?? ""} />
              <input type="hidden" name="caliberId" value={editing.caliberId ?? ""} />
              <fieldset className="space-y-2">
                <legend className="sr-only">{t("title")}</legend>
                {(["none", "allowed", "blocked"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="state" value={s} defaultChecked={editingState === s} className="accent-primary" />
                    {t(`states.${s}`)}
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="reason">{t("reason")}</Label>
                <Textarea id="reason" name="reason" rows={2} maxLength={300} defaultValue={editingRule?.reason ?? ""} placeholder={t("reasonPlaceholder")} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {t("save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
