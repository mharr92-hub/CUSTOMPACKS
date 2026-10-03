"use client";

import { useEffect, useState } from "react";
import { brand } from "@/config/brand";
import { log } from "@/lib/log";
import { whatsappLink } from "@/lib/whatsapp";

export type ErrorVariant = "site" | "quote" | "portal" | "admin";

type Texts = { title: string; body: string; home: string; contact: string; retry: string; code: string; whatsappText: string };

const HOME: Record<ErrorVariant, string> = { site: "/", quote: "/", portal: "/", admin: "/admin/solicitudes" };

/**
 * Pantalla de error común (COD-02). Las secciones públicas no cargan textos
 * en el navegador, así que los textos de messages/es.json se piden aquí solo
 * cuando ocurre un error: no pesan en ninguna página que funciona bien.
 */
export function ErrorScreen({ error, reset, variant }: { error: Error & { digest?: string }; reset: () => void; variant: ErrorVariant }) {
  const [t, setT] = useState<Texts | null>(null);

  useEffect(() => {
    log.error("pantalla de error", { error, digest: error.digest, variant });
  }, [error, variant]);

  useEffect(() => {
    let alive = true;
    void import("@/messages/es.json").then((m) => {
      const e = m.default.errors;
      if (alive) setT({ ...e[variant], retry: e.retry, code: e.code, whatsappText: e.whatsappText });
    });
    return () => {
      alive = false;
    };
  }, [variant]);

  const secondary =
    variant === "admin" ? "/admin/pedidos" : whatsappLink(t?.whatsappText.replace("{brand}", brand.name) ?? "");

  return (
    <div role="alert" aria-busy={t ? undefined : true} className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      {t ? (
        <>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em]">{t.title}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{t.body}</p>
          {error.digest ? <p className="mt-2 text-sm text-muted-foreground">{t.code.replace("{code}", error.digest)}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center rounded-md bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t.retry}
            </button>
            <a href={HOME[variant]} className="inline-flex h-11 items-center rounded-md border border-border px-5 font-semibold hover:bg-muted">
              {t.home}
            </a>
            <a
              href={secondary}
              {...(variant === "admin" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              className="inline-flex h-11 items-center rounded-md border border-border px-5 font-semibold hover:bg-muted"
            >
              {t.contact}
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}
