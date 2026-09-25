import "server-only";
import { actorFor, type CurrentUser } from "@/lib/auth";
import { withActor } from "@/lib/db/actor";
import { templateVariables } from "./render";

/** Plantillas de mensajes (§21-C) editables desde el panel. */
export type MessageTemplate = {
  id: string;
  code: string;
  channel: "email" | "whatsapp";
  audience: "client" | "team";
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  variables: string[];
  isActive: boolean;
  isProvisional: boolean;
  updatedAt: Date;
};

type Row = {
  id: string;
  code: string;
  channel: "email" | "whatsapp";
  audience: "client" | "team";
  name: string;
  description: string | null;
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  is_provisional: boolean;
  updated_at: Date;
};

const toTemplate = (r: Row): MessageTemplate => ({
  id: r.id,
  code: r.code,
  channel: r.channel,
  audience: r.audience,
  name: r.name,
  description: r.description,
  subject: r.subject,
  body: r.body,
  variables: r.variables,
  isActive: r.is_active,
  isProvisional: r.is_provisional,
  updatedAt: r.updated_at,
});

export async function listTemplates(user: CurrentUser): Promise<MessageTemplate[]> {
  const rows = await withActor(actorFor(user), (tx) => tx<Row[]>`
    select id, code, channel, audience, name, description, subject, body, variables, is_active, is_provisional, updated_at
      from public.message_templates order by sort_order, code, channel`);
  return rows.map(toTemplate);
}

export async function getTemplate(user: CurrentUser, id: string): Promise<MessageTemplate | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await withActor(actorFor(user), (tx) => tx<Row[]>`
    select id, code, channel, audience, name, description, subject, body, variables, is_active, is_provisional, updated_at
      from public.message_templates where id = ${id}`);
  return rows[0] ? toTemplate(rows[0]) : null;
}

export type TemplateInput = { subject: string; body: string; isActive: boolean };
export type TemplateSaveResult = { ok: true } | { ok: false; error: "not_found" | "body" | "subject" | "unknown_vars"; vars?: string[] };

/**
 * Guarda el texto de una plantilla (solo admin, por RLS). Solo admite las
 * variables que ese evento puede completar: una variable desconocida dejaría
 * el mensaje con un hueco.
 */
export async function updateTemplate(user: CurrentUser, id: string, input: TemplateInput): Promise<TemplateSaveResult> {
  const current = await getTemplate(user, id);
  if (!current) return { ok: false, error: "not_found" };
  const body = input.body.trim().slice(0, 4000);
  const subject = input.subject.trim().slice(0, 200);
  if (body.length < 10) return { ok: false, error: "body" };
  if (current.channel === "email" && subject.length < 3) return { ok: false, error: "subject" };
  const unknown = [...templateVariables(body), ...templateVariables(subject)].filter((v) => !current.variables.includes(v));
  if (unknown.length) return { ok: false, error: "unknown_vars", vars: [...new Set(unknown)] };
  const rows = await withActor(actorFor(user), (tx) => tx`
    update public.message_templates
       set body = ${body}, subject = ${current.channel === "email" ? subject : null}, is_active = ${input.isActive}, is_provisional = false
     where id = ${id} and public.is_admin()
     returning id`);
  return rows.length ? { ok: true } : { ok: false, error: "not_found" };
}

/** Valores de ejemplo para la vista previa (nunca datos reales de clientes). */
export const SAMPLE_VARIABLES: Record<string, string> = {
  nombre: "Ana",
  numero: "S-2026-00012",
  pieza: "Caja plegadiza con tapa",
  empresa: "Café del Istmo",
  segmento: "alimentos",
  semaforo: "amarillo",
  lista: "el peso del producto, una foto o referencia",
  enlace: "https://provenpack.com/seguimiento/ejemplo",
  enlace_panel: "https://provenpack.com/admin/solicitudes/ejemplo",
  numero_cotizacion: "C-2026-00034",
  fecha: "15 oct 2026",
  anticipo: "50",
  saldo: "50",
  plazo: "30",
  numero_pedido: "P-2026-00007",
  hito: "QA en planta",
  monto: "US$1,250.00",
  horas: "5",
  tarea: "primera respuesta",
};
