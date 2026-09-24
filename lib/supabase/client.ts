"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de navegador. El MVP no lo necesita (Auth y Storage pasan por el
 * servidor); queda listo para realtime o subidas resumibles en fase 2.
 * Requiere NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient(url, anonKey);
}
