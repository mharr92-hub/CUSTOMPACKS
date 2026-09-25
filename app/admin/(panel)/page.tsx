import { redirect } from "next/navigation";

/** Portada del panel: la Bandeja de solicitudes. */
export default function AdminHomePage() {
  redirect("/admin/solicitudes");
}
