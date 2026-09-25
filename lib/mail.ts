import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";
import { log } from "@/lib/log";

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type EmailResult =
  | { status: "sent"; providerId: string | null }
  | { status: "simulated"; previewPath: string | null }
  | { status: "failed"; error: string };

/** Escapa texto para meterlo en el HTML de un correo (todo lo que escribe el visitante pasa por aquí). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * Arma el HTML de un párrafo con valores escapados y, opcionalmente, un enlace
 * (URL generada por el servidor) en el marcador {link}.
 */
export function htmlParagraph(render: (values: Record<string, string>) => string, values: Record<string, string>, link?: string): string {
  const LINK = "\u0000link\u0000";
  const html = escapeHtml(render(link ? { ...values, link: LINK } : values));
  return `<p>${link ? html.replace(LINK, `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>`) : html}</p>`;
}

/**
 * Envía un correo con Resend. Sin RESEND_API_KEY no falla: lo escribe en
 * consola y guarda una vista previa HTML en .data/mail (modo simulado).
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const env = getServerEnv();
  const to = Array.isArray(message.to) ? message.to : [message.to];
  if (!env.resendApiKey) return simulate(message, to);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.mailFrom,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content.toString("base64"),
          content_type: a.contentType,
        })),
      }),
    });
    if (!response.ok) {
      const error = `Resend ${response.status}: ${(await response.text()).slice(0, 300)}`;
      log.error("correo no enviado", { to, subject: message.subject, error });
      return { status: "failed", error };
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", providerId: body.id ?? null };
  } catch (error) {
    log.error("correo no enviado", { to, subject: message.subject, error });
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function simulate(message: EmailMessage, to: string[]): Promise<EmailResult> {
  log.info("correo simulado (sin RESEND_API_KEY)", { to, subject: message.subject });
  log.info(message.text);
  let previewPath: string | null = null;
  if (getServerEnv().nodeEnv !== "production") {
    try {
      const dir = path.join(process.cwd(), ".data", "mail");
      await fs.mkdir(dir, { recursive: true });
      const slug = message.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      previewPath = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug}.html`);
      await fs.writeFile(previewPath, `<!-- para: ${to.join(", ")} -->\n${message.html}`, "utf8");
    } catch {
      previewPath = null;
    }
  }
  return { status: "simulated", previewPath };
}
