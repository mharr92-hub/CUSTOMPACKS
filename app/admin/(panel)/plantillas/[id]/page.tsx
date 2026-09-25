import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProvisionalBadge } from "@/components/admin/provisional-badge";
import { requireStaff } from "@/lib/auth";
import { getTemplate, SAMPLE_VARIABLES } from "@/lib/notify/templates";
import { TemplateForm } from "./template-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.templates");
  return { title: t("title") };
}

export default async function TemplatePage(props: PageProps<"/admin/plantillas/[id]">) {
  const { id } = await props.params;
  const user = await requireStaff(undefined, `/admin/plantillas/${id}`);
  const template = await getTemplate(user, id);
  if (!template) notFound();
  const t = await getTranslations("admin.templates");
  const samples = Object.fromEntries(template.variables.map((v) => [v, SAMPLE_VARIABLES[v] ?? v]));
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/plantillas" className="text-sm text-muted-foreground hover:underline">
        {t("back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        {template.isProvisional ? <ProvisionalBadge /> : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(`channel.${template.channel}`)}
        {" · "}
        {t(`audience.${template.audience}`)}
        {template.description ? ` · ${template.description}` : ""}
      </p>
      <div className="mt-6">
        <TemplateForm
          id={template.id}
          channel={template.channel}
          subject={template.subject ?? ""}
          body={template.body}
          isActive={template.isActive}
          variables={template.variables}
          samples={samples}
          canEdit={user.role === "admin"}
        />
      </div>
    </div>
  );
}
