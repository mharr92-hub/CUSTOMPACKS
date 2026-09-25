/**
 * Render de plantillas de mensajes (§21-C): variables entre llaves, p. ej.
 * "Hola {nombre}". Las variables de enlace ({enlace}, {enlace_panel}) son
 * siempre URLs generadas por el sistema y en el HTML se vuelven enlaces; todo
 * lo demás se escapa.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const VAR = /\{([a-z_]+)\}/g;
export const LINK_VARIABLES = ["enlace", "enlace_panel"] as const;

export function templateVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VAR)].map((m) => m[1] as string))];
}

/** Variables que la plantilla usa y no tienen valor (no se envía un mensaje incompleto). */
export function missingVariables(texts: readonly (string | null | undefined)[], vars: TemplateVars): string[] {
  const used = new Set(texts.flatMap((t) => (t ? templateVariables(t) : [])));
  return [...used].filter((name) => {
    const v = vars[name];
    return v === undefined || v === null || String(v).trim() === "";
  });
}

export function renderText(template: string, vars: TemplateVars): string {
  return template.replace(VAR, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] as string);
}

export function renderHtml(template: string, vars: TemplateVars): string {
  const body = escapeHtml(template).replace(VAR, (_, name: string) => {
    const raw = vars[name];
    if (raw === undefined || raw === null) return "";
    const value = escapeHtml(String(raw));
    const isLink = (LINK_VARIABLES as readonly string[]).includes(name) && /^https?:\/\//.test(String(raw));
    return isLink ? `<a href="${value}">${value}</a>` : value;
  });
  return body
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Correo con la marca: el texto de la plantilla en un marco simple, legible en cualquier cliente de correo. */
export function emailLayout(input: { brand: string; html: string; footer: string }): string {
  return [
    '<!doctype html><html lang="es"><body style="margin:0;background:#f3f1ed;font-family:Arial,Helvetica,sans-serif;color:#15130f">',
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">',
    `<p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:#1e4a36">${escapeHtml(input.brand)}</p>`,
    `<div style="background:#ffffff;border-radius:8px;padding:20px 20px 8px;font-size:15px;line-height:1.5">${input.html}</div>`,
    `<p style="margin:16px 0 0;font-size:12px;color:#5b5448">${escapeHtml(input.footer)}</p>`,
    "</div></body></html>",
  ].join("");
}
