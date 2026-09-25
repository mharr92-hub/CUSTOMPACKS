import type { Metadata } from "next";
import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth";
import { log } from "@/lib/log";
import { runDueJobs } from "@/lib/notify";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  // Sin crons frecuentes (plan gratuito): el uso del panel pone al día la cola y el SLA (D-054).
  after(() => runDueJobs().catch((error) => log.error("procesos pendientes con error", { error })));
  return <AdminShell user={user}>{children}</AdminShell>;
}
