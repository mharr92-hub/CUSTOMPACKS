import "server-only";
import { actorFor, EDITOR_ROLES, type CurrentUser } from "@/lib/auth";
import { getPublicCatalog } from "@/lib/catalog/public";
import { withActor } from "@/lib/db/actor";
import type { Tx } from "@/lib/db/client";
import { todayInPanama } from "@/lib/leadtime";
import { reorderState } from "@/lib/orders/reorder";
import { parseWizardState } from "@/lib/quote/schema";
import { itemSpecFromDraft, trafficInputFromSpec, type ItemSpec } from "@/lib/quote/spec";
import type { ItemDraft, StepId, WizardState } from "@/lib/quote/types";
import { isValidEmail, normalizeWhatsapp, validateStep, type StepErrors } from "@/lib/quote/validate";
import { trafficLight } from "@/lib/traffic-light";

/**
 * Edición de la solicitud desde el panel (M13, PAN-03): la ficha de una pieza
 * (tipo, tamaño, material, impresión, cantidades) y el contacto. Cada cambio
 * de pieza guarda la ficha anterior (quote_item_versions) y recalcula el
 * semáforo; el semáforo inicial (M7) no cambia.
 */
const UUID = /^[0-9a-f-]{36}$/i;
const EDITABLE: readonly string[] = ["submitted", "in_review", "data_pending", "rfq_sent", "quoted", "expired"];

export type EditResult =
  | { ok: true; warning: "rfq" | "quote" | null }
  | { ok: false; error: "forbidden" | "not_found" | "status" | "invalid" | "reason" | "contact"; fields?: StepErrors };

function isEditor(user: CurrentUser): boolean {
  return user.isActive && EDITOR_ROLES.includes(user.role);
}

/**
 * Recalcula semáforo y faltantes con los archivos y referencias de hoy
 * (REG-12): al editar una pieza, al subir o borrar arte y al volver a revisión.
 */
export async function recalcTrafficLight(tx: Tx, requestId: string): Promise<void> {
  const items = await tx<{ id: string; spec_snapshot: ItemSpec }[]>`
    select id, spec_snapshot from public.quote_items where request_id = ${requestId} order by position`;
  if (!items.length) return;
  const files = await tx<{ item_id: string; n: number }[]>`
    select item_id, count(*)::int as n from public.artwork_files
     where request_id = ${requestId} and kind = 'artwork' and deleted_at is null group by item_id`;
  const photos = await tx<{ item_id: string; n: number }[]>`
    select r.item_id, count(*)::int as n from public.quote_references r join public.quote_items i on i.id = r.item_id
     where i.request_id = ${requestId} and r.kind = 'photo' group by r.item_id`;
  const result = trafficLight(
    items.map((i) => {
      const spec = i.spec_snapshot;
      return {
        ...trafficInputFromSpec(spec),
        artworkFileCount: files.find((f) => f.item_id === i.id)?.n ?? 0,
        referenceCount: spec.references.links.length + spec.references.samples.length + (photos.find((p) => p.item_id === i.id)?.n ?? 0),
      };
    }),
  );
  await tx`
    update public.quote_requests
       set traffic_light = ${result.light}, missing_fields = ${result.missing.map((m) => `${m.item}:${m.field}`)}
     where id = ${requestId}`;
}

/** Edita la ficha de una pieza (antes de aceptar la cotización). */
export async function editRequestItem(user: CurrentUser, requestId: string, itemId: string, input: { item: unknown; reason: string }): Promise<EditResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(requestId) || !UUID.test(itemId)) return { ok: false, error: "not_found" };
  const reason = input.reason.trim().slice(0, 1000);
  if (reason.length < 3) return { ok: false, error: "reason" };
  const catalog = await getPublicCatalog();
  return withActor(actorFor(user), async (tx) => {
    const [r] = await tx<{ status: string; segment: WizardState["segment"] }[]>`
      select status, segment from public.quote_requests where id = ${requestId} for update`;
    if (!r) return { ok: false, error: "not_found" } as const;
    if (!EDITABLE.includes(r.status)) return { ok: false, error: "status" } as const;
    const [current] = await tx<{ position: number; spec_snapshot: ItemSpec }[]>`
      select position, spec_snapshot from public.quote_items where id = ${itemId} and request_id = ${requestId}`;
    if (!current) return { ok: false, error: "not_found" } as const;
    const old = current.spec_snapshot;

    // Estado del cotizador con el producto de la solicitud y la pieza editada.
    const base = reorderState(
      {
        segment: r.segment,
        company: null,
        contactName: "",
        email: null,
        whatsapp: null,
        city: null,
        address: null,
        comment: "",
        lines: [{ position: 1, quantity: old.quantities[0] ?? 1, spec: old }],
      },
      catalog,
    );
    const parsed = parseWizardState({ ...base, step: 2, current: 0, items: [input.item] });
    const draft = parsed?.items[0] as ItemDraft | undefined;
    if (!parsed || !draft) return { ok: false, error: "invalid" } as const;
    const state: WizardState = { ...parsed, current: 0, desiredDate: "" };
    const ctx = { catalog, today: todayInPanama() };
    const fields: StepErrors = {};
    for (const step of [2, 3, 4, 5, 6] as StepId[]) Object.assign(fields, validateStep(state, step, ctx));
    if (Object.keys(fields).length) return { ok: false, error: "invalid", fields } as const;

    // El arte y las referencias no se editan aquí: se conservan de la ficha anterior.
    const printingNow = !draft.needsAdvice && Boolean(catalog.printOptions.find((p) => p.id === draft.printOptionId && !p.isNoPrint));
    const artwork = old.artwork && old.artwork !== "not_applicable" ? old.artwork : printingNow ? "no_artwork_yet" : null;
    const spec: ItemSpec = {
      ...itemSpecFromDraft({ ...draft, artwork }, current.position - 1, state, catalog),
      product: old.product,
      artworkFileCount: old.artworkFileCount,
      references: old.references,
    };

    const [next] = await tx<{ v: number }[]>`select coalesce(max(version), 0) + 1 as v from public.quote_item_versions where item_id = ${itemId}`;
    await tx`
      insert into public.quote_item_versions (item_id, request_id, version, spec_snapshot, reason)
      values (${itemId}, ${requestId}, ${next?.v ?? 1}, ${tx.json(old as never)}, ${reason})`;
    const custom = spec.size.mode === "custom" ? spec.size.custom : null;
    await tx`
      update public.quote_items
         set category_id = ${spec.category?.id ?? null}, product_type_id = ${spec.type?.id ?? null}, needs_advice = ${spec.needsAdvice},
             size_mode = ${spec.size.mode}, standard_size_id = ${spec.size.standard?.id ?? null},
             length_cm = ${custom?.l ?? null}, width_cm = ${custom?.w ?? null}, height_cm = ${custom?.h ?? null},
             paper_id = ${spec.paper?.id ?? null}, caliber_id = ${spec.caliber?.id ?? null},
             eco_attribute_ids = ${spec.eco.map((e) => e.id)}::uuid[], food_attribute_ids = ${spec.food.map((f) => f.id)}::uuid[],
             print_option_id = ${spec.print.option?.id ?? null}, pantone_codes = ${spec.print.pantone}::text[],
             print_faces = ${spec.print.faces}, print_coverage = ${spec.print.coverage}, finish_ids = ${spec.finishes.map((f) => f.id)}::uuid[],
             quantities = ${spec.quantities}::int[], frequency = ${spec.frequency}, spec_snapshot = ${tx.json(spec as never)}
       where id = ${itemId}`;
    await tx`
      update public.quote_requests
         set needs_advice = exists (select 1 from public.quote_items where request_id = ${requestId} and needs_advice)
       where id = ${requestId}`;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${requestId}, 'quote_item', ${itemId}, ${user.userId}, 'note', 'item_edited', ${`${current.position} · ${reason}`})`;
    await recalcTrafficLight(tx, requestId);
    const [docs] = await tx<{ rfq: boolean; quote: boolean }[]>`
      select exists (select 1 from public.factory_rfqs where request_id = ${requestId}) as rfq,
             exists (select 1 from public.quotes where request_id = ${requestId} and status <> 'draft') as quote`;
    return { ok: true, warning: docs?.quote ? "quote" : docs?.rfq ? "rfq" : null } as const;
  });
}

export type ContactInput = { name: string; company: string; email: string; whatsapp: string; city: string; address: string; reason: string };

/** Corrige el contacto (también sirve para la rectificación de la Ley 81). */
export async function editRequestContact(user: CurrentUser, requestId: string, input: ContactInput): Promise<EditResult> {
  if (!isEditor(user)) return { ok: false, error: "forbidden" };
  if (!UUID.test(requestId)) return { ok: false, error: "not_found" };
  const reason = input.reason.trim().slice(0, 1000);
  if (reason.length < 3) return { ok: false, error: "reason" };
  const name = input.name.trim().slice(0, 160);
  const email = input.email.trim().slice(0, 200) || null;
  const whatsapp = input.whatsapp.trim() ? normalizeWhatsapp(input.whatsapp) : null;
  if (name.length < 2 || (email && !isValidEmail(email)) || (input.whatsapp.trim() && !whatsapp) || (!email && !whatsapp)) return { ok: false, error: "contact" };
  return withActor(actorFor(user), async (tx) => {
    const rows = await tx`
      update public.quote_requests
         set contact_name = ${name}, company_name = ${input.company.trim().slice(0, 200) || null}, contact_email = ${email}, contact_whatsapp = ${whatsapp},
             delivery_city = ${input.city.trim().slice(0, 120) || null}, delivery_address = ${input.address.trim().slice(0, 400) || null}
       where id = ${requestId} returning id`;
    if (!rows.length) return { ok: false, error: "not_found" } as const;
    await tx`
      insert into public.activities (request_id, entity_type, entity_id, user_id, channel, kind, body)
      values (${requestId}, 'quote_request', ${requestId}, ${user.userId}, 'note', 'contact_edited', ${reason})`;
    return { ok: true, warning: null } as const;
  });
}
