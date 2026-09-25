// Carga los datos de demostración (docs/DEMO.md).
// Uso: pnpm db:seed-demo [--permitir-supabase]
// Dos empresas marcadas DEMO y tres solicitudes: Enviada, Cotizada, y Aceptada
// con su pedido en QA y una foto. Si ya están cargadas, solo muestra los enlaces.
// Pensado para la base local o una base de demo: contra un proyecto de Supabase
// se niega salvo con --permitir-supabase.
import { connect, isSupabaseDatabase, loadEnvFiles, LOCAL_URL } from "./lib/pg-local.mjs";

await loadEnvFiles();
process.env.PROVENPACK_SCRIPT = "1";
// La demo nunca manda correos reales: todo queda "simulado" en notifications.
delete process.env.RESEND_API_KEY;
process.env.FACTORY_EMAIL ||= "fabrica@demo.provenpack.test";
const args = process.argv.slice(2);
const url = process.env.DATABASE_URL || LOCAL_URL;
const out = (m: string) => process.stdout.write(`${m}\n`);

const probe = connect(url);
const supabase = await isSupabaseDatabase(probe);
await probe.end({ timeout: 5 });
if (supabase && !args.includes("--permitir-supabase")) {
  process.stderr.write("La base es un proyecto de Supabase. La demo es para la base local o una base de prueba; usa --permitir-supabase si de verdad quieres cargarla ahí.\n");
  process.exit(2);
}

const { seedDemo } = await import("@/lib/demo/seed");
const { getSql } = await import("@/lib/db/client");
const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
try {
  const summary = await seedDemo({ adminEmail: (process.env.ADMIN_EMAIL || "admin@provenpack.test").toLowerCase() });
  out(summary.created ? "Datos de demostración cargados." : "La demo ya estaba cargada: estos son sus enlaces.");
  out(`\nPanel: ${base}/admin  (admin: ${summary.adminEmail} · ventas: ${summary.salesEmail})`);
  const label = { nueva: "Nueva (Enviada)", cotizada: "Cotizada", pedido: "Aceptada, pedido en QA" } as const;
  for (const r of summary.requests) {
    out(`\n${label[r.key]} · ${r.number} · ${r.company}`);
    out(`  Panel:       ${base}/admin/solicitudes/${r.requestId}`);
    if (r.orderId) out(`  Pedido:      ${base}/admin/pedidos/${r.orderId}`);
    out(`  Cliente:     ${base}/seguimiento/${r.accessToken}`);
  }
} catch (error) {
  const query = (error as { query?: string }).query;
  process.stderr.write(`No se pudo cargar la demo: ${error instanceof Error ? error.message : String(error)}${query ? `
Consulta: ${query.replace(/\s+/g, " ").slice(0, 400)}` : ""}
`);
  process.exitCode = 1;
} finally {
  await getSql().end({ timeout: 5 });
}
