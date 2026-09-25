import { describe, expect, it } from "vitest";
import { businessHoursBetween, parseBusinessHours } from "@/lib/notify/business-hours";
import { missingVariables, renderHtml, renderText, templateVariables } from "@/lib/notify/render";
import { balanceReminderDue, daysBetween, expiryReminderDue, npsDue } from "@/lib/notify/schedule";

describe("plantillas de mensajes (§21-C)", () => {
  const body = "Hola {nombre}, recibimos tu solicitud {numero} para {pieza}. Sigue el estado aquí: {enlace}.";

  it("completa las variables y detecta las que faltan", () => {
    expect(templateVariables(body)).toEqual(["nombre", "numero", "pieza", "enlace"]);
    const vars = { nombre: "Ana", numero: "S-2026-00012", pieza: "Caja", enlace: "https://provenpack.com/seguimiento/x" };
    expect(renderText(body, vars)).toBe("Hola Ana, recibimos tu solicitud S-2026-00012 para Caja. Sigue el estado aquí: https://provenpack.com/seguimiento/x.");
    expect(missingVariables([body], { ...vars, pieza: " " })).toEqual(["pieza"]);
    expect(missingVariables(["Asunto {numero}", body], { nombre: "Ana" })).toEqual(["numero", "pieza", "enlace"]);
  });

  it("en HTML escapa lo que escribe el cliente y solo enlaza las URLs del sistema", () => {
    const html = renderHtml(body, { nombre: '<a href="https://evil.example">x</a>', numero: "S-1", pieza: "Caja & bolsa", enlace: "https://provenpack.com/seguimiento/x" });
    expect(html).toContain("Hola &lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;");
    expect(html).toContain("Caja &amp; bolsa");
    expect(html).toContain('<a href="https://provenpack.com/seguimiento/x">');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(renderHtml("{enlace}", { enlace: "javascript:alert(1)" })).toBe("<p>javascript:alert(1)</p>");
  });
});

describe("horas hábiles para el SLA", () => {
  const cfg = parseBusinessHours({ timezone: "America/Panama", days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" });
  // Panamá es UTC-5 todo el año.
  const pa = (iso: string) => new Date(`${iso}-05:00`);

  it("cuenta solo lunes a viernes de 8:00 a 17:00", () => {
    expect(businessHoursBetween(pa("2026-09-21T09:00:00"), pa("2026-09-21T13:00:00"), cfg)).toBe(4);
    expect(businessHoursBetween(pa("2026-09-21T07:00:00"), pa("2026-09-21T18:30:00"), cfg)).toBe(9);
    // viernes 16:00 → lunes 9:00 = 1 h + 1 h
    expect(businessHoursBetween(pa("2026-09-25T16:00:00"), pa("2026-09-28T09:00:00"), cfg)).toBe(2);
    // sábado completo no cuenta
    expect(businessHoursBetween(pa("2026-09-26T08:00:00"), pa("2026-09-26T17:00:00"), cfg)).toBe(0);
    expect(businessHoursBetween(pa("2026-09-21T10:00:00"), pa("2026-09-21T09:00:00"), cfg)).toBe(0);
  });

  it("una configuración inválida vuelve al horario por defecto", () => {
    expect(parseBusinessHours({ days: [0, 9], start: "8" })).toEqual({ timezone: "America/Panama", days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" });
  });
});

describe("recordatorios programados (§12)", () => {
  const at = (iso: string) => new Date(`${iso}T15:00:00Z`);

  it("vigencia a 3 y 1 día; saldo a los 2 y 5 días; NPS desde el día 7", () => {
    expect(daysBetween(at("2026-09-24"), at("2026-09-27"))).toBe(3);
    expect(expiryReminderDue(at("2026-09-27"), at("2026-09-24"))).toBe(3);
    expect(expiryReminderDue(at("2026-09-27"), at("2026-09-26"))).toBe(1);
    expect(expiryReminderDue(at("2026-09-27"), at("2026-09-25"))).toBeNull();
    expect(balanceReminderDue(at("2026-09-20"), at("2026-09-22"))).toBe(2);
    expect(balanceReminderDue(at("2026-09-20"), at("2026-09-25"))).toBe(5);
    expect(balanceReminderDue(at("2026-09-20"), at("2026-09-23"))).toBeNull();
    expect(npsDue(at("2026-09-17"), at("2026-09-24"))).toBe(true);
    expect(npsDue(at("2026-09-18"), at("2026-09-24"))).toBe(false);
  });
});
