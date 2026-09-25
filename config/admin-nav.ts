import type { AppRole } from "@/lib/auth";

export type AdminNavKey = "inbox" | "orders" | "catalog" | "templates" | "reports" | "users" | "files" | "settings";

export type AdminNavItem = { key: AdminNavKey; href: string; roles: readonly AppRole[] };

const STAFF: readonly AppRole[] = ["admin", "sales", "ops", "viewer"];

/** Menú del panel (PRD §11). Cada bloque agrega sus secciones al construirlas. */
export const adminNav: readonly AdminNavItem[] = [
  { key: "catalog", href: "/admin/catalogo", roles: STAFF },
  { key: "templates", href: "/admin/plantillas", roles: STAFF },
  { key: "files", href: "/admin/archivos", roles: ["admin"] },
  { key: "settings", href: "/admin/configuracion", roles: ["admin"] },
];
