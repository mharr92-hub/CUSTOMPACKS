import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return <AdminShell user={user}>{children}</AdminShell>;
}
