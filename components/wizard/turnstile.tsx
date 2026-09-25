"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Captcha invisible de Cloudflare Turnstile (opcional). Sin
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY no carga nada y `getToken` devuelve null.
 * Solo muestra un desafío si Cloudflare lo pide ("interaction-only").
 */
type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function loadScript(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(window.turnstile ?? null), { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
  });
}

/** @param active carga el script solo al llegar al resumen (no pesa en el resto del cotizador). */
export function useTurnstile(active: boolean): { enabled: boolean; mount: (el: HTMLDivElement | null) => void; getToken: () => Promise<string | null> } {
  const [container, mount] = useState<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const waiting = useRef<((token: string | null) => void) | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !active || !container) return;
    let cancelled = false;
    void loadScript().then((api) => {
      if (cancelled || !api || widget.current) return;
      widget.current = api.render(container, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        execution: "execute",
        callback: (token: string) => waiting.current?.(token),
        "error-callback": () => waiting.current?.(null),
        "expired-callback": () => waiting.current?.(null),
      });
    });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [active, container]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!SITE_KEY) return null;
    const api = await loadScript();
    const id = widget.current;
    if (!api || !id) return null;
    const token = await new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 20_000);
      waiting.current = (value) => {
        window.clearTimeout(timer);
        resolve(value);
      };
      api.execute(id);
    });
    waiting.current = null;
    api.reset(id); // cada token sirve una sola vez
    return token;
  }, []);

  return { enabled: Boolean(SITE_KEY), mount, getToken };
}
