import "server-only";
import { cache } from "react";
import { withActor, type Actor } from "@/lib/db/actor";
import type { RequestStatus } from "@/lib/states";
import type { ItemSpec } from "./spec";

/**
 * Lectura de una solicitud para el cliente (enlace seguro) o el staff. El
 * cliente lee como `anon` con su token: RLS y los permisos por columna solo le
 * dejan ver lo suyo y sin datos internos.
 */
export type TrackingRequest = {
  id: string;
  number: string;
  status: RequestStatus;
  segment: "commercial" | "food" | "unsure";
  companyName: string | null;
  contactName: string;
  contactEmail: string | null;
  contactWhatsapp: string | null;
  deliveryCity: string | null;
  deliveryAddress: string | null;
  desiredDate: string | null;
  submittedAt: Date;
  items: { id: string; position: number; spec: ItemSpec }[];
  history: { status: RequestStatus; at: Date }[];
};

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

async function load(actor: Actor, where: { token?: string; id?: string }): Promise<TrackingRequest | null> {
  return withActor(actor, async (tx) => {
    const [r] = await tx<
      {
        id: string;
        number: string;
        status: RequestStatus;
        segment: TrackingRequest["segment"];
        company_name: string | null;
        contact_name: string;
        contact_email: string | null;
        contact_whatsapp: string | null;
        delivery_city: string | null;
        delivery_address: string | null;
        desired_date: string | null;
        submitted_at: Date;
      }[]
    >`
      select id, number, status, segment, company_name, contact_name, contact_email, contact_whatsapp,
             delivery_city, delivery_address, to_char(desired_date, 'YYYY-MM-DD') as desired_date, submitted_at
        from public.quote_requests
       where ${where.token ? tx`true` : tx`id = ${where.id ?? null}`}
       limit 1`;
    if (!r) return null;
    const items = await tx<{ id: string; position: number; spec_snapshot: ItemSpec }[]>`
      select id, position, spec_snapshot from public.quote_items where request_id = ${r.id} order by position`;
    const history = await tx<{ to_status: RequestStatus; changed_at: Date }[]>`
      select to_status, changed_at from public.quote_request_status_log where request_id = ${r.id} order by changed_at`;
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      segment: r.segment,
      companyName: r.company_name,
      contactName: r.contact_name,
      contactEmail: r.contact_email,
      contactWhatsapp: r.contact_whatsapp,
      deliveryCity: r.delivery_city,
      deliveryAddress: r.delivery_address,
      desiredDate: r.desired_date,
      submittedAt: r.submitted_at,
      items: items.map((i) => ({ id: i.id, position: i.position, spec: i.spec_snapshot })),
      history: history.map((h) => ({ status: h.to_status, at: h.changed_at })),
    };
  });
}

/** Solicitud por enlace seguro (el token solo abre esa solicitud). */
export const getRequestByToken = cache(async (token: string): Promise<TrackingRequest | null> => {
  if (!TOKEN_RE.test(token)) return null;
  return load({ kind: "anon", accessToken: token }, { token });
});

/** Solicitud por id para el staff (RLS: solo si el usuario es del equipo). */
export async function getRequestForUser(actor: Actor, id: string): Promise<TrackingRequest | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return load(actor, { id });
}
