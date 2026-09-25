"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Cierra un <details> (menú móvil) cuando cambia la ruta. */
export function CloseOnNavigate({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (el instanceof HTMLDetailsElement) el.open = false;
  }, [pathname, targetId]);
  return null;
}
