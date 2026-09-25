import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { asActor, closeTestSql, createUser, testSql } from "../support/db";

afterAll(closeTestSql);

const token = () => randomBytes(32).toString("base64url");
let seq = 0;

/** Solicitud con una pieza y archivos de arte (v1) y proof (v1) opcionales. */
async function requestWithFiles(opts: { assignedTo?: string; proofStatus?: string } = {}) {
  const sql = testSql();
  seq += 1;
  const [{ number }] = (await sql`select public.next_document_number('S') as number`) as unknown as [{ number: string }];
  const access = token();
  const [req] = await sql<{ id: string }[]>`
    insert into public.quote_requests (number, access_token, traffic_light, segment, contact_name, contact_email, consent_at, assigned_to)
    values (${number}, ${access}, 'green', 'commercial', 'Cliente', 'c@example.com', now(), ${opts.assignedTo ?? null}) returning id`;
  const [item] = await sql<{ id: string }[]>`
    insert into public.quote_items (request_id, position, quantities, spec_snapshot) values (${req!.id}, 1, '{1000}', '{"position":1}') returning id`;
  const [art] = await sql<{ id: string }[]>`
    insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status)
    values (${item!.id}, ${req!.id}, 'artwork', 1, ${`requests/${req!.id}/${item!.id}/artwork/a${seq}-arte.pdf`}, 'arte.pdf', 'pdf', 1000, 'approved_for_proof') returning id`;
  const [proof] = await sql<{ id: string }[]>`
    insert into public.artwork_files (item_id, request_id, kind, version, storage_path, file_name, format, size_bytes, status, uploaded_by_client)
    values (${item!.id}, ${req!.id}, 'proof', 1, ${`requests/${req!.id}/${item!.id}/proof/p${seq}-proof.pdf`}, 'proof.pdf', 'pdf', 1000, ${opts.proofStatus ?? "proof_sent"}, false) returning id`;
  return { requestId: req!.id, itemId: item!.id, access, artId: art!.id, proofId: proof!.id };
}

describe("arte: quién ve y quién abre (PRD §9)", () => {
  it("el cliente ve solo el arte de su solicitud con su enlace; sin enlace, nada", async () => {
    const mine = await requestWithFiles();
    const other = await requestWithFiles();
    const seen = await asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx<{ id: string }[]>`select id from public.artwork_files`);
    expect(new Set(seen.map((r) => r.id))).toEqual(new Set([mine.artId, mine.proofId]));
    const none = await asActor({ kind: "anon" }, (tx) => tx`select id from public.artwork_files where request_id = ${other.requestId}`);
    expect(none).toHaveLength(0);
    await expect(
      asActor({ kind: "anon", accessToken: mine.access }, (tx) => tx`update public.artwork_files set status = 'released' where id = ${mine.artId}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("abrir y revisar: solo el equipo asignado y admin", async () => {
    const assigned = await createUser(`asignado-${seq}-${Date.now()}@test.local`, "sales");
    const outsider = await createUser(`otro-${seq}-${Date.now()}@test.local`, "sales");
    const admin = await createUser(`admin-${seq}-${Date.now()}@test.local`, "admin");
    const r = await requestWithFiles({ assignedTo: assigned });
    const access = async (userId: string) =>
      (await asActor({ kind: "user", userId }, (tx) => tx<{ ok: boolean }[]>`select public.can_access_request_files(${r.requestId}::uuid) as ok`))[0]?.ok;
    expect(await access(assigned)).toBe(true);
    expect(await access(admin)).toBe(true);
    expect(await access(outsider)).toBe(false);

    const blocked = await asActor({ kind: "user", userId: outsider }, (tx) => tx`update public.artwork_files set comments = 'x' where id = ${r.artId} returning id`);
    expect(blocked).toHaveLength(0);
    const allowed = await asActor({ kind: "user", userId: assigned }, (tx) => tx`update public.artwork_files set comments = 'Revisar sangrado' where id = ${r.artId} returning id`);
    expect(allowed).toHaveLength(1);
    // Todo el equipo ve que hay archivos (bandeja), aunque no pueda abrirlos.
    const listed = await asActor({ kind: "user", userId: outsider }, (tx) => tx`select id from public.artwork_files where request_id = ${r.requestId}`);
    expect(listed).toHaveLength(2);
  });
});

describe("aprobación del proof: sello de tiempo inmutable", () => {
  it("al aprobar, el proof pasa a «Proof aprobado» con la misma hora, y nadie puede cambiarla", async () => {
    const sql = testSql();
    const r = await requestWithFiles();
    const [approval] = await sql<{ approved_at: Date }[]>`
      insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name, approved_by_email, ip, user_agent)
      values (${r.proofId}, ${r.requestId}, 'Ana Pérez', 'c@example.com', '203.0.113.7', 'test') returning approved_at`;
    const [file] = await sql<{ status: string; client_approved_at: Date }[]>`select status, client_approved_at from public.artwork_files where id = ${r.proofId}`;
    expect(file?.status).toBe("proof_approved");
    expect(file?.client_approved_at.getTime()).toBe(approval?.approved_at.getTime());

    await expect(sql`update public.artwork_approvals set approved_at = now() - interval '1 day' where artwork_file_id = ${r.proofId}`).rejects.toThrow(/inmutable/);
    await expect(sql`delete from public.artwork_approvals where artwork_file_id = ${r.proofId}`).rejects.toThrow(/inmutable/);
    await expect(sql`update public.artwork_files set client_approved_at = now() where id = ${r.proofId}`).rejects.toThrow(/inmutable/);
    await expect(sql`delete from public.artwork_files where id = ${r.proofId}`).rejects.toThrow(/foreign key|violates/);
  });

  it("solo se aprueba un proof enviado, y el equipo no puede marcarlo aprobado por su cuenta", async () => {
    const sql = testSql();
    const r = await requestWithFiles();
    await expect(sql`
      insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name) values (${r.artId}, ${r.requestId}, 'Ana')`).rejects.toThrow(/Solo se aprueba un proof enviado/);
    await expect(sql`update public.artwork_files set status = 'proof_approved' where id = ${r.proofId}`).rejects.toThrow(/Solo el cliente aprueba el proof/);
    await expect(asActor({ kind: "anon", accessToken: r.access }, (tx) => tx`
      insert into public.artwork_approvals (artwork_file_id, request_id, approved_by_name) values (${r.proofId}, ${r.requestId}, 'Ana')`)).rejects.toThrow(/permission denied/);
  });
});
