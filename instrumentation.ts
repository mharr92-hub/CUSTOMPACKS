import type { Instrumentation } from "next";

/** Errores no capturados de páginas, acciones y rutas: al log y, si hay DSN, a Sentry. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import("@/lib/log");
  log.error("error no capturado en una petición", {
    error,
    path: request.path.split("?")[0],
    method: request.method,
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
