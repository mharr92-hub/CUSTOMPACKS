import { redirect } from "next/navigation";

/** Portada del panel. En E6 pasa a ser la Bandeja de solicitudes. */
export default function AdminHomePage() {
  redirect("/admin/catalogo");
}
