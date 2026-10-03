"use client";

import { ErrorScreen } from "@/components/error-screen";
import "./globals.css";

/** Falla del layout raíz: reemplaza todo el documento, por eso trae html y body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col antialiased">
        <ErrorScreen error={error} reset={reset} variant="site" />
      </body>
    </html>
  );
}
