import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

afterAll(closeTestSql);

const token = () => randomBytes(32).toString("base64url");

async function createRequest(overrides: Record<string, unknown> = {}) {
  const sql = testSql();
  const [{ number }] = (await sql`select public.next_document_number('S') as number`) as unknown as [{ number: string }];
  const access = token();
  const [row] = await sql<{ id: string }[]>`
    insert into public.quote_requests (number, access_token, traffic_light, segment, contact_name, contact_email, consent_at)
    values (${number}, ${access}, 'yellow', 'food', 'Cliente', 'c@example.com', now()) returning id`;
  if (!row) throw new Error("sin solicitud");
  if (Object.keys(overrides).length) await sql`update public.quote_requests set ${sql(overrides)} where id = ${row.id}`;
  await sql`
    insert into public.quote_items (request_id, position, quantities, spec_snapshot)
    values (${row.id}, 1, '{5000}', '{"position":1}')`;
  return { id: row.id, number, access };
}

describe("numeración S-AAAA-NNNNN", () => {
  it("tiene el formato del PRD y es correlativa", async () => {
    const sql = testSql();
    const rows = await sql<{ n: string }[]>`select public.next_document_number('S') as n union all select public.next_document_number('S')`;
    const [a, b] = rows.map((r) => r.n);
    expect(a).toMatch(/^S-\d{4}-\d{5}$/);
    expect(Number(b?.slice(-5))).toBe(Number(a?.slice(-5)) + 1);
  });

  it("no repite números con envíos simultáneos", async () => {
    const sql = testSql();
    const numbers = await Promise.all(Array.from({ length: 25 }, () => sql<{ n: string }[]>`select public.next_document_number('C') as n`.then((r) => r[0]?.n)));
    expect(new Set(numbers).size).toBe(25);
  });

  it("anon no puede pedir números", async () => {
    await expect(asActor({ kind: "anon" }, (tx) => tx`select public.next_document_number('S')`)).rejects.toThrow(/permission denied/);
  });
});

describe("máquina de estados en base (PRD §14)", () => {
  it("registra el historial y los timestamps de cada estado", async () => {
    const sql = testSql();
    const r = await createRequest();
    await sql`update public.quote_requests set status = 'in_review' where id = ${r.id}`;
    await sql`update public.quote_requests set status = 'rfq_sent' where id = ${r.id}`;
    const [row] = await sql<{ in_review_at: Date | null; rfq_sent_at: Date | null }[]>`select in_review_at, rfq_sent_at from public.quote_requests where id = ${r.id}`;
    expect(row?.in_review_at).toBeInstanceOf(Date);
    expect(row?.rfq_sent_at).toBeInstanceOf(Date);
    const log = await sql<{ to_status: string }[]>`select to_status from public.quote_request_status_log where request_id = ${r.id} order by changed_at, to_status`;
    expect(log.map((l) => l.to_status)).toEqual(["submitted", "in_review", "rfq_sent"]);
  });

  it("rechaza saltos no permitidos", async () => {
    const r = await createRequest();
    await expect(testSql()`update public.quote_requests set status = 'quoted' where id = ${r.id}`).rejects.toThrow(/Transición no permitida/);
  });

  it("Rechazada exige motivo de pérdida", async () => {
    const sql = testSql();
    const r = await createRequest();
    for (const s of ["in_review", "rfq_sent", "quoted"]) await sql`update public.quote_requests set status = ${s}::public.request_status where id = ${r.id}`;
    await expect(sql`update public.quote_requests set status = 'rejected' where id = ${r.id}`).rejects.toThrow(/check constraint/);
    await sql`update public.quote_requests set status = 'rejected', loss_reason = 'price' where id = ${r.id}`;
  });
});

describe("RLS: el cliente ve solo lo suyo con su enlace", () => {
  it("con su token ve su solicitud, sus piezas y su historial; sin token, nada", async () => {
    const mine = await createRequest();
    const other = await createRequest();
    const seen = await asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx<{ id: string }[]>`select id from public.quote_requests`);
    expect(seen.map((r) => r.id)).toEqual([mine.id]);
    const items = await asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx<{ request_id: string }[]>`select request_id from public.quote_items`);
    expect(new Set(items.map((i) => i.request_id))).toEqual(new Set([mine.id]));
    const log = await asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx`select 1 from public.quote_request_status_log where request_id = ${other.id}`);
    expect(log).toHaveLength(0);
    const none = await asActor({ kind: "anon" }, (tx) => tx`select id from public.quote_requests`);
    expect(none).toHaveLength(0);
  });

  it("el cliente no puede leer columnas internas ni escribir", async () => {
    const mine = await createRequest();
    await expect(asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx`select traffic_light from public.quote_requests`)).rejects.toThrow(/permission denied/);
    await expect(asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx`select consent_ip from public.quote_requests`)).rejects.toThrow(/permission denied/);
    await expect(
      asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx`update public.quote_requests set status = 'in_review'`),
    ).rejects.toThrow(/permission denied/);
    await expect(asActor({ kind: "anon" }, (tx) => tx`select * from public.activities`)).rejects.toThrow(/permission denied/);
  });

  it("borradores: solo con su token; el staff no los necesita", async () => {
    const t1 = token();
    await asActor({ kind: "anon", accessToken: t1 }, (tx) => tx`insert into public.quote_drafts (token, payload) values (${t1}, '{}')`, { commit: true });
    const own = await asActor({ kind: "anon", accessToken: t1 }, (tx) => tx`select 1 from public.quote_drafts`);
    expect(own).toHaveLength(1);
    const foreign = await asActor({ kind: "anon", accessToken: token() }, (tx) => tx`select 1 from public.quote_drafts where token = ${t1}`);
    expect(foreign).toHaveLength(0);
    await expect(
      asActor({ kind: "anon", accessToken: token() }, (tx) => tx`insert into public.quote_drafts (token, payload) values (${t1 + "x"}, '{}')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("el staff ve todas las solicitudes; solo lectura no las modifica", async () => {
    const r = await createRequest();
    const viewer = await createUser(`viewer-${Date.now()}@test.local`, "viewer");
    const sales = await createUser(`sales-${Date.now()}@test.local`, "sales");
    const seen = await asActor({ kind: "user", userId: viewer }, (tx) => tx`select id, traffic_light from public.quote_requests where id = ${r.id}`);
    expect(seen).toHaveLength(1);
    const noop = await asActor({ kind: "user", userId: viewer }, (tx) => tx`update public.quote_requests set status = 'in_review' where id = ${r.id} returning id`);
    expect(noop).toHaveLength(0);
    const ok = await asActor({ kind: "user", userId: sales }, (tx) => tx`update public.quote_requests set status = 'in_review' where id = ${r.id} returning id`);
    expect(ok).toHaveLength(1);
  });
});
