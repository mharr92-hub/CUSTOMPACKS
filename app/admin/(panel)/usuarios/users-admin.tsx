"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserActionResult } from "@/lib/panel/users";
import { changeRoleAction, inviteUserAction, setActiveAction } from "./actions";

const ROLES = ["admin", "sales", "ops", "viewer"] as const;
const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export type UserRow = { userId: string; email: string | null; name: string | null; role: string; isActive: boolean; lastSignIn: string | null; isSelf: boolean };

function useRun() {
  const t = useTranslations("admin.users");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<UserActionResult>, ok?: (r: Extract<UserActionResult, { ok: true }>) => void) {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        ok?.(result);
        router.refresh();
      } else setError(t(`errors.${result.error}`));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

export function InviteForm() {
  const t = useTranslations("admin.users");
  const ta = useTranslations("admin");
  const { error, busy, run } = useRun();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("sales");
  const [devLink, setDevLink] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => inviteUserAction({ email, name, role }),
          (r) => {
            toast.success(t("invited"));
            setDevLink(r.devLink ?? null);
            setEmail("");
            setName("");
          },
        );
      }}
    >
      <label className="grid gap-1 text-xs font-medium">
        {t("email")}
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {t("name")}
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {t("role")}
        <select value={role} onChange={(e) => setRole(e.target.value)} className={select}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ta(`roles.${r}`)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={busy || !email}>
        {t("send")}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {error}
        </p>
      ) : null}
      {devLink ? (
        <p className="text-xs break-all sm:col-span-4">
          {`${t("devLink")}: `}
          <a href={devLink} className="text-forest underline">
            {devLink}
          </a>
        </p>
      ) : null}
    </form>
  );
}

export function UserRowControls({ row }: { row: UserRow }) {
  const t = useTranslations("admin.users");
  const ta = useTranslations("admin");
  const { error, busy, run } = useRun();
  if (row.isSelf) return <span className="text-xs text-muted-foreground">{t("you")}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${row.userId}`}>
        {t("role")}
      </label>
      <select
        id={`role-${row.userId}`}
        value={row.role}
        disabled={busy}
        onChange={(e) => void run(() => changeRoleAction(row.userId, e.target.value))}
        className={select}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ta(`roles.${r}`)}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => setActiveAction(row.userId, !row.isActive))}>
        {row.isActive ? t("deactivate") : t("activate")}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
