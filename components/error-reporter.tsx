"use client";

import { useEffect } from "react";
import { log } from "@/lib/log";

/** Errores no capturados del navegador: al log (y a Sentry si hay DSN). Solo se monta con DSN. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => log.error("error en el navegador", { error: e.error instanceof Error ? e.error : new Error(e.message) });
    const onRejection = (e: PromiseRejectionEvent) => log.error("promesa rechazada en el navegador", { error: e.reason instanceof Error ? e.reason : new Error(String(e.reason)) });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
