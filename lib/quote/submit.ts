import "server-only";
import { getPublicCatalog } from "@/lib/catalog/public";
import { serviceActor, withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { trafficLight } from "@/lib/traffic-light";
import { randomToken } from "@/lib/tokens";
import { loadDraft } from "./drafts";
import { itemSpecFromDraft, trafficInputFromSpec, type ItemSpec } from "./spec";
import type { StepId, WizardState } from "./types";
import { normalizeWhatsapp, parseCm, validateAll, type StepErrors } from "./validate";

export type SubmitResult =
  | { ok: true; requestId: string; number: string; accessToken: string; specs: ItemSpec[]; state: WizardState; alreadySubmitted: boolean }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid"; step: StepId; item: number; errors: StepErrors };

/**
 * Convierte un borrador en solicitud: revalida todo en el servidor (incluidas
 * las compatibilidades con el catálogo vigente), calcula el semáforo, congela
 * la ficha técnica de cada pieza y asigna el número S-AAAA-NNNNN. Es
 * idempotente: un segundo envío del mismo borrador devuelve la misma solicitud.
 */
export async function submitDraft(token: string, meta: { ip: string | null }): Promise<SubmitResult> {
  const draft = await loadDraft(token);
  if (!draft) return { ok: false, reason: "not_found" };
  const state = draft.state;
  const catalog = await getPublicCatalog();

  if (draft.submittedRequestId) {
    const existing = await findRequest(draft.submittedRequestId);
    if (existing) return { ok: true, ...existing, specs: [], state, alreadySubmitted: true };
  }

  const check = validateAll(state, { catalog });
  if (!check.ok) return { ok: false, reason: "invalid", step: check.step, item: check.item, errors: check.errors };

  const specs = state.items.map((item, i) => itemSpecFromDraft(item, i, state, catalog));
  const traffic = trafficLight(specs.map(trafficInputFromSpec));
  const c = state.contact;
  const whatsapp = c.whatsapp.trim() ? normalizeWhatsapp(c.whatsapp) : null;
  const email = c.email.trim().toLowerCase() || null;
  const needsAdvice = state.items.some((it) => it.needsAdvice || it.materialAdvice || it.sizeMode === "by_product");
  const accessToken = randomToken(32);

  const result = await withActor(serviceActor, async (tx) => {
    // Bloquea el borrador: si otro envío ganó la carrera, devuelve esa solicitud.
    const [locked] = await tx<{ id: string; submitted_request_id: string | null }[]>`
      select id, submitted_request_id from public.quote_drafts where token = ${token} for update`;
    if (!locked) return null;
    if (locked.submitted_request_id) return { existingId: locked.submitted_request_id as string };

    const numbered = await tx<{ number: string }[]>`select public.next_document_number('S') as number`;
    const number = numbered[0]?.number;
    if (!number) throw new Error("no se pudo numerar la solicitud");
    const company = await resolveCompany(tx, { state, email, whatsapp });
    const [request] = await tx<{ id: string }[]>`
      insert into public.quote_requests (
        number, access_token, status, traffic_light, missing_fields, channel, segment, company_id, company_name, ruc,
        contact_name, contact_position, contact_email, contact_whatsapp, delivery_city, delivery_address, desired_date,
        comments, lead_source, needs_advice, utm, referrer, consent_at, consent_ip, draft_id
      ) values (
        ${number}, ${accessToken}, 'submitted', ${traffic.light}, ${traffic.missing.map((m) => `${m.item}:${m.field}`)},
        'web', ${state.segment}, ${company}, ${c.company.trim() || null}, ${normalizeRuc(c.ruc)},
        ${c.name.trim()}, ${c.position.trim() || null}, ${email}, ${whatsapp},
        ${c.city.trim()}, ${c.address.trim()}, ${state.desiredDate || null}, ${c.comments.trim() || null}, ${c.source || null},
        ${needsAdvice}, ${tx.json(state.utm)}, ${state.referrer || null}, now(), ${meta.ip}, ${locked.id}
      ) returning id`;
    if (!request) throw new Error("no se creó la solicitud");

    for (const [i, item] of state.items.entries()) {
      const spec = specs[i] as ItemSpec;
      const cm = (v: string) => {
        const n = parseCm(v);
        return typeof n === "number" ? n : null;
      };
      const custom = item.sizeMode === "custom" && !item.needsAdvice;
      const [row] = await tx<{ id: string }[]>`
        insert into public.quote_items (
          request_id, position, category_id, product_type_id, needs_advice, size_mode, standard_size_id,
          length_cm, width_cm, height_cm, paper_id, caliber_id, eco_attribute_ids, food_attribute_ids,
          print_option_id, pantone_codes, print_faces, print_coverage, finish_ids,
          product_name, product_contents, product_weight_g, product_length_cm, product_width_cm, product_height_cm,
          product_volume, product_conditions, product_uses, quantities, frequency, artwork_status, spec_snapshot
        ) values (
          ${request.id}, ${i + 1}, ${spec.category?.id ?? null}, ${spec.type?.id ?? null}, ${item.needsAdvice},
          ${spec.size.mode}, ${spec.size.standard?.id ?? null},
          ${custom ? cm(item.length) : null}, ${custom ? cm(item.width) : null}, ${custom ? cm(item.height) : null},
          ${spec.paper?.id ?? null}, ${spec.caliber?.id ?? null},
          ${spec.eco.map((e) => e.id)}::uuid[], ${spec.food.map((f) => f.id)}::uuid[],
          ${spec.print.option?.id ?? null}, ${spec.print.pantone}::text[], ${spec.print.faces}, ${spec.print.coverage},
          ${spec.finishes.map((f) => f.id)}::uuid[],
          ${spec.product.name || null}, ${spec.product.contents || null}, ${spec.product.weightG},
          ${spec.product.dims?.l ?? null}, ${spec.product.dims?.w ?? null}, ${spec.product.dims?.h ?? null},
          ${spec.product.volume || null}, ${spec.product.conditions}::public.product_condition[],
          ${spec.product.uses}::public.product_use[], ${spec.quantities}::integer[], ${spec.frequency},
          ${spec.artwork}, ${tx.json(spec as never)}
        ) returning id`;
      if (!row) throw new Error("no se creó la pieza");
      for (const link of spec.references.links) {
        await tx`insert into public.quote_references (item_id, kind, url) values (${row.id}, 'link', ${link})`;
      }
      for (const sample of spec.references.samples) {
        await tx`insert into public.quote_references (item_id, kind, gallery_sample_id) values (${row.id}, 'gallery_sample', ${sample.id})`;
      }
    }

    await tx`
      insert into public.activities (request_id, entity_type, entity_id, channel, kind, body, payload)
      values (${request.id}, 'quote_request', ${request.id}, 'system', 'submitted', ${number},
              ${tx.json({ trafficLight: traffic.light, missing: traffic.missing, pieces: specs.length })})`;
    await tx`update public.quote_drafts set submitted_request_id = ${request.id} where id = ${locked.id}`;
    return { requestId: request.id, number, accessToken };
  });

  if (!result) return { ok: false, reason: "not_found" };
  if ("existingId" in result && result.existingId) {
    const existing = await findRequest(result.existingId);
    if (!existing) return { ok: false, reason: "not_found" };
    return { ok: true, ...existing, specs: [], state, alreadySubmitted: true };
  }
  if (!result.requestId || !result.number || !result.accessToken) return { ok: false, reason: "not_found" };
  return { ok: true, requestId: result.requestId, number: result.number, accessToken: result.accessToken, specs, state, alreadySubmitted: false };
}

/** RUC normalizado: sin espacios y en mayúsculas (así se compara y se guarda). */
export function normalizeRuc(ruc: string): string | null {
  const r = ruc.replace(/\s+/g, "").toUpperCase();
  return r || null;
}

/**
 * Empresa de la solicitud (Empresa 1:N solicitudes, §13): la del mismo RUC; si
 * no hay RUC, la de una solicitud anterior del mismo correo o WhatsApp; si no
 * existe, se crea. Sin nombre de empresa, la persona figura como su propia cuenta.
 */
async function resolveCompany(tx: Tx, input: { state: WizardState; email: string | null; whatsapp: string | null }): Promise<string> {
  const c = input.state.contact;
  const ruc = normalizeRuc(c.ruc);
  if (ruc) {
    const [byRuc] = await tx<{ id: string }[]>`select id from public.companies where ruc = ${ruc}`;
    if (byRuc) return byRuc.id;
  }
  if (input.email || input.whatsapp) {
    // Con un RUC nuevo solo se reutiliza una empresa que aún no tenga RUC.
    const [previous] = await tx<{ company_id: string }[]>`
      select r.company_id from public.quote_requests r
        join public.companies co on co.id = r.company_id
       where ((${input.email}::text is not null and r.contact_email = ${input.email}) or (${input.whatsapp}::text is not null and r.contact_whatsapp = ${input.whatsapp}))
         and (${ruc}::text is null or co.ruc is null)
       order by r.submitted_at desc
       limit 1`;
    if (previous) {
      if (ruc) await tx`update public.companies set ruc = ${ruc} where id = ${previous.company_id} and ruc is null`;
      return previous.company_id;
    }
  }
  const [created] = await tx<{ id: string }[]>`
    insert into public.companies (trade_name, ruc, segment, city, default_address, lead_source)
    values (${c.company.trim() || c.name.trim()}, ${ruc}, ${input.state.segment}, ${c.city.trim()}, ${c.address.trim()}, ${c.source || null})
    on conflict (ruc) where ruc is not null do nothing
    returning id`;
  if (created) return created.id;
  const [raced] = await tx<{ id: string }[]>`select id from public.companies where ruc = ${ruc}`;
  if (!raced) throw new Error("no se pudo crear la empresa");
  return raced.id;
}

async function findRequest(id: string): Promise<{ requestId: string; number: string; accessToken: string } | null> {
  const rows = await withActor(serviceActor, (tx) => tx<{ id: string; number: string; access_token: string }[]>`
    select id, number, access_token from public.quote_requests where id = ${id}`);
  const r = rows[0];
  return r ? { requestId: r.id, number: r.number, accessToken: r.access_token } : null;
}
