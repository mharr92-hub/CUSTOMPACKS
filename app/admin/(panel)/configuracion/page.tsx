import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProvisionalBadge } from "@/components/admin/provisional-badge";
import { requireStaff } from "@/lib/auth";
import { listSettings } from "@/lib/catalog/admin";
import { SettingForm } from "./setting-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const user = await requireStaff(["admin"], "/admin/configuracion");
  const t = await getTranslations("admin.settings");
  const te = await getTranslations("enums.settingType");
  const settings = await listSettings(user);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        {settings.map((s) => (
          <li key={s.key} className="grid gap-3 p-4 md:grid-cols-[1fr_minmax(0,22rem)] md:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm font-semibold">{s.key}</code>
                <span className="text-xs text-muted-foreground">{te(s.value_type)}</span>
                {s.is_provisional ? <ProvisionalBadge /> : null}
              </div>
              {s.description ? <p className="mt-1 text-sm text-muted-foreground">{s.description}</p> : null}
            </div>
            <SettingForm settingKey={s.key} valueType={s.value_type} value={s.value_type === "json" ? JSON.stringify(s.value) : String(s.value)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
